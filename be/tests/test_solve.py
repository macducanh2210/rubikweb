from time import perf_counter
from typing import Any
from importlib.util import find_spec

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models.rubik import RubikState
from app.models.solution import Solution
from app.services import solver
from app.services.cube_model import FACE_ORDER, RubikCube, SOLVED_FACELETS

COLORS = dict(zip(FACE_ORDER, ("white", "orange", "green", "yellow", "red", "blue")))


def state_from_facelets(facelets: str) -> dict[str, list[str]]:
    return {
        face: [COLORS[sticker] for sticker in facelets[index * 9:(index + 1) * 9]]
        for index, face in enumerate(FACE_ORDER)
    }


def register(client: TestClient, username: str) -> dict[str, Any]:
    email = f"{username}@example.com"
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "password123",
            "display_name": username,
            "otp_code": client.registration_codes[email],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def headers(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def create_state(
    session_factory: sessionmaker[Session],
    user_id: int,
    cube_state: dict[str, list[str]],
) -> int:
    with session_factory() as db:
        state = RubikState(user_id=user_id, cube_state=cube_state, confidence_score=1.0)
        db.add(state)
        db.commit()
        return state.id


@pytest.mark.parametrize("face", FACE_ORDER)
def test_move_and_inverse_and_four_turns(face: str) -> None:
    assert RubikCube().apply_moves([face, f"{face}'"]).is_solved()
    assert RubikCube().apply_moves([face] * 4).is_solved()
    assert RubikCube().apply_move(f"{face}2").to_facelets() == RubikCube().apply_moves([face, face]).to_facelets()
    assert not RubikCube().apply_move(face).is_solved()


def test_cube_model_rejects_bad_facelets_and_move() -> None:
    with pytest.raises(ValueError):
        RubikCube("U" * 54)
    with pytest.raises(ValueError):
        RubikCube().apply_move("X")
    with pytest.raises(ValueError):
        RubikCube().apply_move("R3")


@pytest.mark.parametrize(
    ("scramble", "expect_subsecond"),
    [
        ("R", True),
        ("R U R' U'", True),
        ("F2 L D B' U2 R", True),
        ("R U2 F' L2 D B2 R' U F D' L B", False),
    ],
)
def test_known_scrambles_are_solved(scramble: str, expect_subsecond: bool) -> None:
    scrambled = RubikCube().apply_moves(scramble).to_facelets()
    state = state_from_facelets(scrambled)
    assert solver.to_kociemba_facelets(state) == scrambled
    start = perf_counter()
    moves = solver.solve_cube_state(state)
    elapsed = perf_counter() - start
    # Deep states are a strict subsecond check when the native extension is installed.
    # The pure-Python fallback may exceed that threshold.
    if expect_subsecond or find_spec("kociemba.ckociembawrapper") is not None:
        assert elapsed < 1.0, f"{scramble}: {elapsed:.3f}s"
    assert RubikCube(scrambled).apply_moves(moves).is_solved()


def test_solved_cube_has_no_moves() -> None:
    state = state_from_facelets(SOLVED_FACELETS)
    assert solver.solve_cube_state(state) == []


def test_missing_solver_dependency_does_not_break_other_routes(
    client: TestClient,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    auth = register(client, "missing_kociemba")
    facelets = RubikCube().apply_move("R").to_facelets()
    state_id = create_state(session_factory, auth["user"]["id"], state_from_facelets(facelets))
    solver._solve_facelets.cache_clear()
    monkeypatch.setattr(solver, "kociemba", None)
    assert client.get("/health").status_code == 200
    response = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    assert response.status_code == 500
    assert response.json()["error_code"] == "INTERNAL_ERROR"


def test_invalid_cubie_parity_is_unsolvable() -> None:
    facelets = list(SOLVED_FACELETS)
    facelets[5], facelets[7] = facelets[7], facelets[5]
    facelets[10], facelets[19] = facelets[19], facelets[10]
    with pytest.raises(Exception) as exc_info:
        solver.solve_cube_state(state_from_facelets("".join(facelets)))
    assert exc_info.value.error_code == "UNSOLVABLE_STATE"


def test_post_solve_matches_contract_and_persists_solution(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    auth = register(client, "solver_user")
    facelets = RubikCube().apply_moves("R U F2").to_facelets()
    state_id = create_state(session_factory, auth["user"]["id"], state_from_facelets(facelets))

    response = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"success", "data"}
    assert body["success"] is True
    data = body["data"]
    assert set(data) == {"solution_id", "moves", "total_steps", "algorithm"}
    assert data["algorithm"] == "KOCIEMBA"
    assert data["total_steps"] == len(data["moves"])
    assert RubikCube(facelets).apply_moves(data["moves"]).is_solved()
    with session_factory() as db:
        stored = db.get(Solution, data["solution_id"])
        assert stored is not None
        assert stored.rubik_state_id == state_id
        assert stored.moves == data["moves"]


def test_post_solve_solved_state_and_cache(
    client: TestClient,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    auth = register(client, "cache_user")
    solved_id = create_state(session_factory, auth["user"]["id"], state_from_facelets(SOLVED_FACELETS))
    solved_response = client.post("/solve", headers=headers(auth), json={"rubik_state_id": solved_id})
    assert solved_response.status_code == 200
    assert solved_response.json()["data"]["moves"] == []
    assert solved_response.json()["data"]["total_steps"] == 0

    facelets = RubikCube().apply_moves("B L U2").to_facelets()
    state_id = create_state(session_factory, auth["user"]["id"], state_from_facelets(facelets))
    solver._solve_facelets.cache_clear()
    real_solve = solver.kociemba.solve
    calls = 0

    def counted_solve(value: str) -> str:
        nonlocal calls
        calls += 1
        return real_solve(value)

    monkeypatch.setattr(solver.kociemba, "solve", counted_solve)
    first = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    second = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["moves"] == second.json()["data"]["moves"]
    assert calls == 1
    start = perf_counter()
    third = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    assert third.status_code == 200
    assert perf_counter() - start < 1.0


def test_post_solve_requires_auth_and_ownership(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    owner = register(client, "state_owner")
    other = register(client, "state_other")
    state_id = create_state(session_factory, owner["user"]["id"], state_from_facelets(SOLVED_FACELETS))
    unauthorized = client.post("/solve", json={"rubik_state_id": state_id})
    assert unauthorized.status_code == 401
    assert unauthorized.json()["error_code"] == "UNAUTHORIZED"
    for hidden_id in (state_id, state_id + 999):
        response = client.post("/solve", headers=headers(other), json={"rubik_state_id": hidden_id})
        assert response.status_code == 404
        assert response.json() == {
            "success": False,
            "error_code": "RUBIK_STATE_NOT_FOUND",
            "message": "Không tìm thấy trạng thái Rubik",
        }


def test_post_solve_rejects_corrupt_state_without_persisting(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    auth = register(client, "bad_cube_user")
    invalid = state_from_facelets(SOLVED_FACELETS)
    invalid["U"][0] = "red"
    state_id = create_state(session_factory, auth["user"]["id"], invalid)
    response = client.post("/solve", headers=headers(auth), json={"rubik_state_id": state_id})
    assert response.status_code == 400
    assert response.json() == {
        "success": False,
        "error_code": "UNSOLVABLE_STATE",
        "message": "Trạng thái khối Rubik không thể giải",
    }
    with session_factory() as db:
        assert db.scalar(select(Solution)) is None
