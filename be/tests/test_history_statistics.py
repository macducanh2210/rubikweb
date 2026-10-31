from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.history import History
from app.models.rubik import RubikFace, RubikState, rubik_state_faces
from app.models.solution import Solution
from app.services import history as history_service

FACE_COLORS = {
    "U": "white", "R": "red", "F": "green",
    "D": "yellow", "L": "orange", "B": "blue",
}


def _register(client: TestClient, username: str) -> dict[str, Any]:
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


def _headers(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def _solution(
    session_factory: sessionmaker[Session],
    user_id: int,
    *,
    with_images: bool = False,
    steps: int = 4,
) -> tuple[int, int]:
    with session_factory() as db:
        state = RubikState(
            user_id=user_id,
            cube_state={face: [color] * 9 for face, color in FACE_COLORS.items()},
            confidence_score=1.0,
        )
        db.add(state)
        db.flush()
        if with_images:
            for face, color in FACE_COLORS.items():
                image = RubikFace(
                    user_id=user_id,
                    face=face,
                    image_url=f"http://testserver/uploads/faces/{face}.jpg",
                    colors=[color] * 9,
                    confidence_score=1.0,
                )
                db.add(image)
                db.flush()
                db.execute(
                    insert(rubik_state_faces).values(
                        rubik_state_id=state.id,
                        rubik_face_id=image.id,
                        face=face,
                    )
                )
        solution = Solution(
            rubik_state_id=state.id,
            moves=["R", "U", "R'", "U'"][:steps],
            total_steps=steps,
            algorithm="KOCIEMBA",
        )
        db.add(solution)
        db.commit()
        return state.id, solution.id


def _post_history(
    client: TestClient,
    auth: dict[str, Any],
    solution_id: int,
    *,
    status: str = "completed",
    start_time: str = "2026-10-07T10:00:00+07:00",
    end_time: str = "2026-10-07T10:01:35+07:00",
) -> Any:
    return client.post(
        "/history",
        headers=_headers(auth),
        json={
            "solution_id": solution_id,
            "start_time": start_time,
            "end_time": end_time,
            "status": status,
            "duration": 99999,
            "extra": "ignored",
        },
    )


def test_history_create_list_detail_and_ownership(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    owner = _register(client, "history_owner")
    other = _register(client, "history_other")
    state_id, solution_id = _solution(
        session_factory, owner["user"]["id"], with_images=True
    )
    first = _post_history(client, owner, solution_id)
    second = _post_history(client, owner, solution_id, status="abandoned")
    assert first.status_code == second.status_code == 201
    first_data = first.json()["data"]
    assert set(first_data) == {"id", "solution_id", "duration", "status", "created_at"}
    assert first_data["solution_id"] == solution_id
    assert first_data["duration"] == 95
    assert first_data["status"] == "completed"
    assert first_data["created_at"].endswith("Z")
    assert second.json()["data"]["id"] != first_data["id"]

    listed = client.get("/history?page=1&limit=1", headers=_headers(owner))
    assert listed.status_code == 200
    assert listed.json()["data"] == {
        "items": [{
            **second.json()["data"],
            "total_steps": 4,
        }],
        "total": 2,
        "page": 1,
        "limit": 1,
    }

    detail = client.get(f"/history/{first_data['id']}", headers=_headers(owner))
    assert detail.status_code == 200
    data = detail.json()["data"]
    assert set(data) == {
        "id", "status", "duration", "start_time", "end_time", "created_at",
        "solution", "rubik_state",
    }
    assert data["start_time"] == "2026-10-07T03:00:00Z"
    assert data["end_time"] == "2026-10-07T03:01:35Z"
    assert data["solution"] == {
        "id": solution_id,
        "moves": ["R", "U", "R'", "U'"],
        "total_steps": 4,
        "algorithm": "KOCIEMBA",
    }
    assert data["rubik_state"]["id"] == state_id
    assert data["rubik_state"]["cube_state"]["U"] == ["white"] * 9
    assert data["rubik_state"]["face_images"] == {
        face: f"http://testserver/uploads/faces/{face}.jpg" for face in FACE_COLORS
    }

    hidden = client.get(f"/history/{first_data['id']}", headers=_headers(other))
    assert hidden.status_code == 404
    assert hidden.json()["error_code"] == "HISTORY_NOT_FOUND"
    assert client.get("/history", headers=_headers(other)).json()["data"]["total"] == 0


def test_history_rejects_unowned_solution_and_invalid_time(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    owner = _register(client, "solution_owner")
    other = _register(client, "solution_other")
    _, solution_id = _solution(session_factory, owner["user"]["id"])
    for hidden_id in (solution_id, solution_id + 999):
        response = _post_history(client, other, hidden_id)
        assert response.status_code == 404
        assert response.json()["error_code"] == "SOLUTION_NOT_FOUND"
    invalid = _post_history(
        client,
        owner,
        solution_id,
        end_time="2026-10-07T09:59:59+07:00",
    )
    assert invalid.status_code == 400
    assert invalid.json()["error_code"] == "INVALID_TIME_RANGE"
    invalid_status = _post_history(client, owner, solution_id, status="paused")
    assert invalid_status.status_code == 400
    assert invalid_status.json()["error_code"] == "VALIDATION_ERROR"
    missing_time = client.post(
        "/history",
        headers=_headers(owner),
        json={"solution_id": solution_id, "status": "completed"},
    )
    assert missing_time.status_code == 400
    assert "start_time" in missing_time.json()["details"]["fields"]
    wrong_type = client.post(
        "/history",
        headers=_headers(owner),
        json={
            "solution_id": True,
            "start_time": 0,
            "end_time": 60,
            "status": "completed",
        },
    )
    assert wrong_type.status_code == 400
    assert wrong_type.json()["error_code"] == "VALIDATION_ERROR"
    assert {"solution_id", "start_time", "end_time"} <= set(wrong_type.json()["details"]["fields"])


def test_statistics_empty_completed_only_and_recent_50(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    auth = _register(client, "stats_user")
    _, solution_id = _solution(session_factory, auth["user"]["id"], steps=4)
    empty = client.get("/statistics", headers=_headers(auth))
    assert empty.status_code == 200
    assert empty.json() == {
        "success": True,
        "data": {
            "total_solves": 0,
            "average_time": None,
            "best_time": None,
            "average_steps": None,
            "progress": [],
            "updated_at": None,
        },
    }
    _post_history(client, auth, solution_id, status="abandoned")
    assert client.get("/statistics", headers=_headers(auth)).json() == empty.json()

    base = datetime(2026, 9, 1, tzinfo=timezone.utc)
    with session_factory() as db:
        for index in range(52):
            start = base + timedelta(hours=index)
            db.add(
                History(
                    user_id=auth["user"]["id"],
                    solution_id=solution_id,
                    start_time=start,
                    end_time=start + timedelta(seconds=60 + index),
                    duration=60 + index,
                    status="completed",
                    created_at=start,
                )
            )
        db.commit()
    stats = client.get("/statistics", headers=_headers(auth))
    assert stats.status_code == 200
    data = stats.json()["data"]
    assert data["total_solves"] == 52
    assert data["average_time"] == pytest.approx(85.5)
    assert data["best_time"] == 60
    assert data["average_steps"] == 4.0
    assert len(data["progress"]) == 50
    assert data["progress"][0] == {"date": "2026-09-01T02:00:00Z", "duration": 62}
    assert data["progress"][-1] == {"date": "2026-09-03T03:00:00Z", "duration": 111}
    assert data["updated_at"] == "2026-09-03T03:00:00Z"


def test_history_requires_auth_and_pagination_validation(client: TestClient) -> None:
    assert client.get("/history").status_code == 401
    assert client.get("/statistics").status_code == 401
    auth = _register(client, "pagination_user")
    response = client.get("/history?page=0", headers=_headers(auth))
    assert response.status_code == 400
    assert response.json()["error_code"] == "VALIDATION_ERROR"


def test_global_error_handler_never_leaks_exception(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    missing = client.get("/not-a-route")
    assert missing.status_code == 404
    assert set(missing.json()) == {"success", "error_code", "message"}
    assert missing.json()["error_code"] == "NOT_FOUND"
    wrong_method = client.patch("/settings")
    assert wrong_method.status_code == 404
    assert wrong_method.json()["error_code"] == "NOT_FOUND"
    malformed = client.post(
        "/auth/login",
        content=b"{bad-json",
        headers={"Content-Type": "application/json"},
    )
    assert malformed.status_code == 400
    assert malformed.json()["error_code"] == "VALIDATION_ERROR"
    assert "details" in malformed.json()

    auth = _register(client, "exception_user")

    def unexpected(*_: Any) -> Any:
        raise RuntimeError("private diagnostic details")

    monkeypatch.setattr(history_service, "get_statistics", unexpected)
    failure = client.get("/statistics", headers=_headers(auth))
    assert failure.status_code == 500
    assert failure.json() == {
        "success": False,
        "error_code": "INTERNAL_ERROR",
        "message": "Lỗi hệ thống không lường trước",
    }
