from typing import Any

from fastapi.testclient import TestClient

from app.services.practice import average_of_five

SCRAMBLE = ["R", "U2", "F'", "L", "D", "B2", "R'", "U", "F2", "L'", "D2", "B", "R2", "U'", "F", "L2", "D'", "B'", "R", "U2"]


def register(client: TestClient, username: str) -> dict[str, Any]:
    email = f"{username}@example.com"
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    response = client.post("/auth/register", json={
        "username": username,
        "email": email,
        "password": "password123",
        "display_name": username,
        "otp_code": client.registration_codes[email],
    })
    assert response.status_code == 201, response.text
    return response.json()["data"]


def headers(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def save(client: TestClient, auth: dict[str, Any], duration_cs: int):
    return client.post("/practice/attempts", headers=headers(auth), json={
        "scramble": SCRAMBLE,
        "duration_cs": duration_cs,
    })


def test_average_of_five_drops_fastest_and_slowest() -> None:
    assert average_of_five([95, 109, 73, 26, 47]) == 72
    assert average_of_five([100, 100, 100, 100, 100]) == 100


def test_practice_attempts_and_both_leaderboards(client: TestClient) -> None:
    fast_single = register(client, "fast_single")
    fast_average = register(client, "fast_average")
    assert client.get("/practice/leaderboard").status_code == 401

    for index, duration in enumerate([26, 80, 90, 100, 110]):
        response = save(client, fast_single, duration)
        assert response.status_code == 201, response.text
        assert response.json()["data"]["ao5_cs"] == (90 if index == 4 else None)
        assert response.json()["data"]["created_at"].endswith("Z")
    for duration in [50, 51, 52, 53, 54]:
        assert save(client, fast_average, duration).status_code == 201

    own = client.get("/practice/attempts?page=1&limit=2", headers=headers(fast_single))
    assert own.status_code == 200
    own_data = own.json()["data"]
    assert own_data["total"] == 5
    assert len(own_data["items"]) == 2
    assert own_data["items"][0]["duration_cs"] == 110
    assert own_data["items"][0]["ao5_cs"] == 90
    assert own_data["items"][1]["ao5_cs"] is None
    assert own_data["best_single_cs"] == 26
    assert own_data["current_ao5_cs"] == own_data["best_ao5_cs"] == 90
    other_own = client.get("/practice/attempts", headers=headers(fast_average)).json()["data"]
    assert other_own["total"] == 5
    assert other_own["best_single_cs"] == 50
    assert other_own["best_ao5_cs"] == 52

    ranking = client.get("/practice/leaderboard?limit=2", headers=headers(fast_single))
    assert ranking.status_code == 200
    data = ranking.json()["data"]
    assert [item["username"] for item in data["single"]] == ["fast_single", "fast_average"]
    assert [item["duration_cs"] for item in data["single"]] == [26, 50]
    assert [item["username"] for item in data["ao5"]] == ["fast_average", "fast_single"]
    assert [item["duration_cs"] for item in data["ao5"]] == [52, 90]
    assert [item["rank"] for item in data["ao5"]] == [1, 2]


def test_practice_validation_and_empty_lists(client: TestClient) -> None:
    auth = register(client, "practice_empty")
    empty = client.get("/practice/attempts", headers=headers(auth)).json()["data"]
    assert empty["items"] == []
    assert empty["best_single_cs"] is None
    assert empty["best_ao5_cs"] is None
    assert client.get("/practice/leaderboard", headers=headers(auth)).json()["data"] == {"single": [], "ao5": []}

    invalid_bodies = [
        {"scramble": ["R"] * 19, "duration_cs": 100},
        {"scramble": ["r"] * 20, "duration_cs": 100},
        {"scramble": SCRAMBLE, "duration_cs": 0},
        {"scramble": SCRAMBLE, "duration_cs": 1.5},
    ]
    for body in invalid_bodies:
        response = client.post("/practice/attempts", headers=headers(auth), json=body)
        assert response.status_code == 400, response.text
        assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert client.get("/practice/leaderboard?limit=0", headers=headers(auth)).status_code == 400
    assert client.get("/practice/attempts?limit=101", headers=headers(auth)).status_code == 400
