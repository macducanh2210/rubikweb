from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.rubik import RubikFace, RubikState, rubik_state_faces
from app.services.cube_model import FACE_ORDER, RubikCube, SOLVED_FACELETS
from app.services.solver import to_kociemba_facelets
from test_daily_challenge import headers, register

COLORS = dict(zip(FACE_ORDER, ("white", "orange", "green", "yellow", "red", "blue")))


def state_from_facelets(facelets: str):
    return {face: [COLORS[sticker] for sticker in facelets[index * 9:(index + 1) * 9]] for index, face in enumerate(FACE_ORDER)}


def test_manual_cube_solve_and_history_without_fake_faces(client: TestClient, session_factory: sessionmaker[Session]) -> None:
    auth, other = register(client, "manual_owner"), register(client, "manual_other")
    facelets = RubikCube().apply_moves("R U F2 L' D B2").to_facelets()
    state = state_from_facelets(facelets)
    response = client.post("/detect/manual", headers=headers(auth), json={"cube_state": state, "extra": "ignored"})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert set(data) == {"rubik_state_id", "cube_state", "confidence_score"}
    assert data["cube_state"] == state and data["confidence_score"] == 1.0
    with session_factory() as db:
        assert db.get(RubikState, data["rubik_state_id"]).user_id == auth["user"]["id"]
        assert db.scalar(select(func.count(RubikFace.id))) == 0
        assert db.scalar(select(func.count()).select_from(rubik_state_faces)) == 0
    assert client.post("/solve", headers=headers(other), json={"rubik_state_id": data["rubik_state_id"]}).status_code == 404
    solved = client.post("/solve", headers=headers(auth), json={"rubik_state_id": data["rubik_state_id"]})
    assert solved.status_code == 200, solved.text
    solution = solved.json()["data"]
    assert RubikCube(to_kociemba_facelets(state)).apply_moves(solution["moves"]).is_solved()
    history = client.post("/history", headers=headers(auth), json={
        "solution_id": solution["solution_id"], "start_time": "2026-10-11T03:00:00Z",
        "end_time": "2026-10-11T03:01:00Z", "status": "completed",
    })
    assert history.status_code == 201, history.text
    detail = client.get(f"/history/{history.json()['data']['id']}", headers=headers(auth)).json()["data"]
    assert detail["rubik_state"]["face_images"] == {}
    assert detail["rubik_state"]["cube_state"] == state


def test_manual_cube_solved_state_and_auth(client: TestClient) -> None:
    state = state_from_facelets(SOLVED_FACELETS)
    assert client.post("/detect/manual", json={"cube_state": state}).status_code == 401
    auth = register(client, "manual_solved")
    data = client.post("/detect/manual", headers=headers(auth), json={"cube_state": state}).json()["data"]
    result = client.post("/solve", headers=headers(auth), json={"rubik_state_id": data["rubik_state_id"]}).json()["data"]
    assert result["moves"] == [] and result["total_steps"] == 0


def test_manual_cube_precise_validation_and_no_invalid_persistence(client: TestClient, session_factory: sessionmaker[Session]) -> None:
    auth = register(client, "manual_validation")
    state = state_from_facelets(SOLVED_FACELETS)
    missing = deepcopy(state)
    del missing["U"]
    unknown = {**state, "X": ["white"] * 9}
    short = {**state, "U": ["white"] * 8}
    invalid_color = {**state, "U": ["pink"] * 9}
    wrong_count = deepcopy(state)
    wrong_count["U"][0] = "yellow"
    same_centers = deepcopy(state)
    same_centers["R"][4], same_centers["U"][0] = same_centers["U"][0], same_centers["R"][4]
    flipped_edge = deepcopy(state)
    flipped_edge["U"][7], flipped_edge["F"][1] = flipped_edge["F"][1], flipped_edge["U"][7]
    for body, code in [
        ({}, "VALIDATION_ERROR"), ({"cube_state": []}, "VALIDATION_ERROR"),
        ({"cube_state": {"U": "white"}}, "VALIDATION_ERROR"),
        ({"cube_state": missing}, "MISSING_FACE"), ({"cube_state": unknown}, "MISSING_FACE"),
        ({"cube_state": short}, "INVALID_COLOR_ARRAY"), ({"cube_state": invalid_color}, "INVALID_COLOR_ARRAY"),
        ({"cube_state": wrong_count}, "INVALID_CUBE_STATE"), ({"cube_state": same_centers}, "INVALID_CUBE_STATE"),
        ({"cube_state": flipped_edge}, "UNSOLVABLE_STATE"),
    ]:
        response = client.post("/detect/manual", headers=headers(auth), json=body)
        assert response.status_code == 400 and response.json()["error_code"] == code, response.text
        if body.get("cube_state") == wrong_count:
            assert response.json()["details"] == {"invalid_colors": {"white": 8, "yellow": 10}}
    with session_factory() as db:
        assert db.scalar(select(func.count(RubikState.id))) == 0
