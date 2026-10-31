"""Daily routes use isolated test databases and server-controlled dates."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Barrier
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import APIError
from app.db.base import Base
from app.models.daily_challenge import DailyChallenge, DailyChallengeAttempt
from app.models.practice import PracticeAttempt
from app.models.user import User
from app.schemas.daily_challenge import DailyAttemptRequest
from app.schemas.practice import MOVE_PATTERN
from app.services import daily_challenge as daily

NOW = datetime(2026, 10, 11, 3, 0, tzinfo=timezone.utc)


def register(client: TestClient, username: str) -> dict[str, Any]:
    email = f"{username}@example.com"
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    response = client.post("/auth/register", json={
        "username": username, "email": email, "password": "password123",
        "display_name": username, "otp_code": client.registration_codes[email],
    })
    assert response.status_code == 201, response.text
    return response.json()["data"]


def headers(auth: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth['access_token']}"}


def challenge(client: TestClient, auth: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/practice/daily-challenge", headers=headers(auth))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def save(client: TestClient, auth: dict[str, Any], challenge_id: int, duration: int = 1200, attempt_id: str | None = None):
    return client.post("/practice/daily-challenge/attempts", headers=headers(auth), json={
        "challenge_id": challenge_id, "duration_cs": duration,
        "client_attempt_id": attempt_id or str(uuid4()),
    })


def test_shared_scramble_my_attempt_and_utc_day_bounds(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(daily, "utc_now", lambda: NOW)
    first, second = register(client, "daily_first"), register(client, "daily_second")
    initial = challenge(client, first)
    assert set(initial) == {"id", "date", "timezone", "scramble", "starts_at", "ends_at", "server_time", "my_attempt"}
    assert initial == challenge(client, second) == challenge(client, first)
    assert initial["date"] == "2026-10-11"
    assert initial["timezone"] == "Asia/Ho_Chi_Minh"
    assert initial["starts_at"] == "2026-10-10T17:00:00Z"
    assert initial["ends_at"] == "2026-10-11T17:00:00Z"
    assert initial["server_time"] == "2026-10-11T03:00:00Z"
    assert initial["my_attempt"] is None
    assert len(initial["scramble"]) == 20
    assert all(MOVE_PATTERN.fullmatch(move) for move in initial["scramble"])
    axes = [daily.FACE_AXIS[move[0]] for move in initial["scramble"]]
    assert all(a != b for a, b in zip(axes, axes[1:]))
    saved = save(client, first, initial["id"]).json()["data"]
    assert set(saved) == {"id", "duration_cs", "created_at"}
    assert saved["created_at"] == "2026-10-11T03:00:00Z"
    assert challenge(client, first)["my_attempt"] == saved
    assert challenge(client, second)["my_attempt"] is None
    assert client.get("/practice/attempts", headers=headers(first)).json()["data"]["total"] == 0
    assert client.get("/statistics", headers=headers(first)).json()["data"]["total_solves"] == 0


def test_vietnam_rollover_and_old_scramble_expiry(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    auth = register(client, "daily_rollover")
    clock = [datetime(2026, 10, 11, 16, 59, 59, tzinfo=timezone.utc)]
    monkeypatch.setattr(daily, "utc_now", lambda: clock[0])
    old = challenge(client, auth)
    assert old["date"] == "2026-10-11"
    clock[0] = datetime(2026, 10, 11, 17, 0, tzinfo=timezone.utc)
    new = challenge(client, auth)
    assert new["date"] == "2026-10-12" and new["id"] != old["id"]
    assert new["starts_at"] == old["ends_at"]
    expired = save(client, auth, old["id"])
    assert expired.status_code == 400 and expired.json()["error_code"] == "DAILY_CHALLENGE_EXPIRED"
    assert save(client, auth, new["id"]).status_code == 201


def test_immutable_attempt_retries_conflict_and_retry_after_expiry(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [NOW]
    monkeypatch.setattr(daily, "utc_now", lambda: clock[0])
    auth = register(client, "daily_retry")
    day = challenge(client, auth)
    request_id = str(uuid4())
    first = save(client, auth, day["id"], 1234, request_id)
    assert first.status_code == 201
    same = save(client, auth, day["id"], 1234, request_id)
    assert same.status_code == 200 and same.json() == first.json()
    different = save(client, auth, day["id"], 1000)
    assert different.status_code == 409 and different.json()["error_code"] == "DAILY_ATTEMPT_EXISTS"
    changed = save(client, auth, day["id"], 1235, request_id)
    assert changed.status_code == 409 and changed.json()["error_code"] == "ATTEMPT_CONFLICT"
    clock[0] = datetime(2026, 10, 11, 17, 0, tzinfo=timezone.utc)
    next_day = challenge(client, auth)
    after_expiry = save(client, auth, day["id"], 1234, request_id)
    assert after_expiry.status_code == 200 and after_expiry.json() == first.json()
    other_challenge = save(client, auth, next_day["id"], 1234, request_id)
    assert other_challenge.status_code == 409 and other_challenge.json()["error_code"] == "ATTEMPT_CONFLICT"
    assert save(client, auth, next_day["id"], 5678).status_code == 201


def test_daily_auth_strict_validation_and_missing_challenges(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(daily, "utc_now", lambda: NOW)
    for path in ("/practice/daily-challenge", "/practice/daily-challenge/leaderboard"):
        assert client.get(path).status_code == 401
    assert client.post("/practice/daily-challenge/attempts", json={}).status_code == 401
    auth = register(client, "daily_validation")
    day = challenge(client, auth)
    valid = {"challenge_id": day["id"], "duration_cs": 1234, "client_attempt_id": str(uuid4())}
    invalid = [
        {**valid, "challenge_id": 0}, {**valid, "challenge_id": True}, {**valid, "challenge_id": "1"},
        {**valid, "duration_cs": 0}, {**valid, "duration_cs": 360001},
        {**valid, "duration_cs": 1.25}, {**valid, "duration_cs": True},
        {**valid, "client_attempt_id": "invalid"},
    ]
    for body in invalid:
        response = client.post("/practice/daily-challenge/attempts", headers=headers(auth), json=body)
        assert response.status_code == 400 and response.json()["error_code"] == "VALIDATION_ERROR"
    for query in ("?limit=0", "?limit=101", "?challenge_id=0", "?challenge_id=1.5"):
        response = client.get("/practice/daily-challenge/leaderboard" + query, headers=headers(auth))
        assert response.status_code == 400 and response.json()["error_code"] == "VALIDATION_ERROR"
    for response in (save(client, auth, 999999), client.get("/practice/daily-challenge/leaderboard?challenge_id=999999", headers=headers(auth))):
        assert response.status_code == 404 and response.json()["error_code"] == "DAILY_CHALLENGE_NOT_FOUND"
    empty = client.get("/practice/daily-challenge/leaderboard", headers=headers(auth)).json()["data"]
    assert empty == {"challenge_id": day["id"], "date": "2026-10-11", "items": [], "total_participants": 0, "my_rank": None}


def test_daily_ranking_ties_active_only_my_rank_beyond_limit_and_uuid_per_user(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = [NOW]
    monkeypatch.setattr(daily, "utc_now", lambda: clock[0])
    users = [register(client, name) for name in ("daily_rank_a", "daily_rank_b", "daily_rank_c", "daily_locked", "daily_deleted")]
    day = challenge(client, users[0])
    request_id = str(uuid4())
    for auth, duration in zip(users, [1000, 1000, 1000, 900, 800]):
        assert save(client, auth, day["id"], duration, request_id).status_code == 201
    # Equal duration and timestamp is resolved by user id; later timestamp ranks last.
    with session_factory() as db:
        third = db.scalar(select(DailyChallengeAttempt).where(DailyChallengeAttempt.user_id == users[2]["user"]["id"]))
        third.created_at = datetime(2026, 10, 11, 3, 0, 1)
        db.get(User, users[3]["user"]["id"]).status = "locked"
        db.get(User, users[4]["user"]["id"]).status = "deleted"
        db.commit()
    result = client.get(f"/practice/daily-challenge/leaderboard?challenge_id={day['id']}&limit=1", headers=headers(users[2])).json()["data"]
    assert result["total_participants"] == 3 and result["my_rank"] == 3
    assert [item["username"] for item in result["items"]] == ["daily_rank_a"]
    assert set(result["items"][0]) == {"rank", "user_id", "username", "display_name", "duration_cs", "created_at"}
    assert client.get("/practice/daily-challenge", headers=headers(users[3])).status_code == 403
    assert client.get("/practice/daily-challenge", headers=headers(users[4])).status_code == 401
    clock[0] = datetime(2026, 10, 12, 3, 0, tzinfo=timezone.utc)
    today = client.get("/practice/daily-challenge/leaderboard", headers=headers(users[0])).json()["data"]
    assert today["date"] == "2026-10-12" and today["total_participants"] == 0
    yesterday = client.get(f"/practice/daily-challenge/leaderboard?challenge_id={day['id']}", headers=headers(users[0])).json()["data"]
    assert [item["username"] for item in yesterday["items"]] == ["daily_rank_a", "daily_rank_b", "daily_rank_c"]


@pytest.fixture()
def concurrent_factory(tmp_path: Path):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'daily-concurrent.db'}", connect_args={"check_same_thread": False, "timeout": 10})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        yield factory
    finally:
        engine.dispose()


def add_user(factory, username: str = "concurrent") -> User:
    with factory() as db:
        user = User(username=username, email=f"{username}@example.com", display_name=username, password_hash="unused")
        db.add(user)
        db.commit()
        return user


def test_concurrent_challenge_requests_share_one_persisted_scramble(concurrent_factory, monkeypatch: pytest.MonkeyPatch) -> None:
    user = add_user(concurrent_factory)
    barrier = Barrier(2)
    generate = daily.generate_scramble

    def simultaneous_generate():
        moves = generate()
        barrier.wait(timeout=10)
        return moves

    monkeypatch.setattr(daily, "generate_scramble", simultaneous_generate)
    monkeypatch.setattr(daily, "utc_now", lambda: NOW)

    def fetch():
        with concurrent_factory() as db:
            return daily.get_challenge(user, db).data

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: fetch(), range(2)))
    assert results[0].id == results[1].id and results[0].scramble == results[1].scramble
    with concurrent_factory() as db:
        assert db.scalar(select(func.count(DailyChallenge.id))) == 1


@pytest.mark.parametrize("same_uuid", [True, False])
def test_concurrent_official_attempts_cannot_record_twice(concurrent_factory, monkeypatch: pytest.MonkeyPatch, same_uuid: bool) -> None:
    user = add_user(concurrent_factory)
    monkeypatch.setattr(daily, "utc_now", lambda: NOW)
    with concurrent_factory() as db:
        day = daily.get_challenge(user, db).data
    barrier = Barrier(2)
    lookup = daily._existing_official

    def simultaneous_lookup(challenge_id, user_id, db):
        row = lookup(challenge_id, user_id, db)
        if row is None:
            barrier.wait(timeout=10)
        return row

    monkeypatch.setattr(daily, "_existing_official", simultaneous_lookup)
    first_uuid = uuid4()
    requests = [DailyAttemptRequest(challenge_id=day.id, duration_cs=1234, client_attempt_id=first_uuid),
                DailyAttemptRequest(challenge_id=day.id, duration_cs=1234, client_attempt_id=first_uuid if same_uuid else uuid4())]

    def save_request(request):
        with concurrent_factory() as db:
            try:
                result, created = daily.create_attempt(request, user, db)
                return ("created" if created else "retry", result.data.id)
            except APIError as error:
                return error.error_code, None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save_request, requests))
    assert sorted(result[0] for result in results) == (["created", "retry"] if same_uuid else ["DAILY_ATTEMPT_EXISTS", "created"])
    with concurrent_factory() as db:
        assert db.scalar(select(func.count(DailyChallengeAttempt.id))) == 1
        assert db.scalar(select(func.count(PracticeAttempt.id))) == 0
