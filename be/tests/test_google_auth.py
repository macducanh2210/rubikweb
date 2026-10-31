from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import GoogleAuthError
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.models.user import User
from app.services.google_identity import GoogleIdentity, verify_google_identity


def identity(sub: str = "google-sub-1", email: str = "cube@gmail.com") -> GoogleIdentity:
    return GoogleIdentity(sub=sub, email=email, name="Cube Player")


def google_stub(monkeypatch: pytest.MonkeyPatch, value: GoogleIdentity) -> None:
    monkeypatch.setattr("app.services.auth.verify_google_identity", lambda _: value)


def register_password_account(client: TestClient, email: str = "cube@gmail.com") -> dict[str, Any]:
    payload = {
        "username": "cubeplayer", "email": email,
        "password": "password123", "display_name": "Cube Player",
    }
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    payload["otp_code"] = client.registration_codes[email]
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    return response.json()["data"]


def error_code(response: Any, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    assert response.json()["error_code"] == code


def test_google_creates_passwordless_account_and_signs_in_again(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch,
) -> None:
    google_stub(monkeypatch, identity())
    first = client.post("/auth/google", json={"id_token": "verified"})
    assert first.status_code == 200, first.text
    user = first.json()["data"]["user"]
    assert user["email"] == "cube@gmail.com"
    assert user["username"].startswith("cube_")
    with session_factory() as db:
        stored = db.scalar(select(User).where(User.id == user["id"]))
        assert stored is not None
        assert stored.google_sub == "google-sub-1"
        assert stored.password_hash is None
    profile = client.get("/users/me", headers={"Authorization": f"Bearer {first.json()['data']['access_token']}"})
    assert profile.json()["data"]["google_linked"] is True
    assert profile.json()["data"]["has_password"] is False
    second = client.post("/auth/google", json={"id_token": "verified"})
    assert second.status_code == 200
    assert second.json()["data"]["user"]["id"] == user["id"]
    error_code(client.post("/auth/login", json={"identifier": user["email"], "password": "password123"}), 401, "INVALID_CREDENTIALS")


def test_existing_email_requires_explicit_link_after_password_login(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = register_password_account(client)
    google_stub(monkeypatch, identity())
    error_code(client.post("/auth/google", json={"id_token": "verified"}), 409, "GOOGLE_LINK_REQUIRED")
    headers = {"Authorization": f"Bearer {existing['access_token']}"}
    linked = client.post("/auth/google/link", json={"id_token": "verified"}, headers=headers)
    assert linked.status_code == 200
    assert client.post("/auth/google/link", json={"id_token": "verified"}, headers=headers).status_code == 200
    profile = client.get("/users/me", headers=headers).json()["data"]
    assert profile["google_linked"] is True and profile["has_password"] is True
    login = client.post("/auth/google", json={"id_token": "verified"})
    assert login.status_code == 200
    assert login.json()["data"]["user"]["id"] == existing["user"]["id"]


def test_link_rejects_wrong_email_and_other_google_account(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = register_password_account(client)
    headers = {"Authorization": f"Bearer {existing['access_token']}"}
    google_stub(monkeypatch, identity(email="other@gmail.com"))
    error_code(client.post("/auth/google/link", json={"id_token": "verified"}, headers=headers), 409, "GOOGLE_ACCOUNT_MISMATCH")
    google_stub(monkeypatch, identity())
    assert client.post("/auth/google/link", json={"id_token": "verified"}, headers=headers).status_code == 200
    google_stub(monkeypatch, identity(sub="google-sub-2"))
    error_code(client.post("/auth/google/link", json={"id_token": "verified"}, headers=headers), 409, "GOOGLE_ACCOUNT_MISMATCH")


def test_google_login_respects_locked_and_deleted_status(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch,
) -> None:
    google_stub(monkeypatch, identity())
    user_id = client.post("/auth/google", json={"id_token": "verified"}).json()["data"]["user"]["id"]
    with session_factory() as db:
        user = db.get(User, user_id)
        assert user is not None
        user.status = "locked"
        db.commit()
    error_code(client.post("/auth/google", json={"id_token": "verified"}), 403, "ACCOUNT_LOCKED")
    with session_factory() as db:
        user = db.get(User, user_id)
        assert user is not None
        user.status = "deleted"
        db.commit()
    error_code(client.post("/auth/google", json={"id_token": "verified"}), 401, "INVALID_CREDENTIALS")


def test_google_only_account_can_set_password_with_email_otp(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, sent_otps: list[tuple[str, str]],
) -> None:
    google_stub(monkeypatch, identity())
    assert client.post("/auth/google", json={"id_token": "verified"}).status_code == 200
    assert client.post("/auth/forgot-password", json={"email": "cube@gmail.com"}).status_code == 200
    code = sent_otps[-1][1]
    verified = client.post("/auth/verify-otp", json={"email": "cube@gmail.com", "otp_code": code})
    assert verified.status_code == 200
    reset = client.post("/auth/reset-password", json={
        "reset_token": verified.json()["data"]["reset_token"], "new_password": "newpassword123",
    })
    assert reset.status_code == 200
    password_login = client.post("/auth/login", json={"identifier": "cube@gmail.com", "password": "newpassword123"})
    assert password_login.status_code == 200
    assert client.post("/auth/google", json={"id_token": "verified"}).status_code == 200


def test_google_token_verifier_checks_signature_issuer_and_verified_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "google_client_id", "client.apps.googleusercontent.com")
    def accepts_recent_google_token(token: str, request: object, audience: str, clock_skew_in_seconds: int) -> dict[str, object]:
        assert audience == settings.google_client_id
        assert clock_skew_in_seconds == 120
        return {"iss": "https://accounts.google.com", "sub": "123", "email": "cube@gmail.com", "email_verified": True, "name": "Cube Player"}
    monkeypatch.setattr(
        "app.services.google_identity.google_id_token.verify_oauth2_token",
        accepts_recent_google_token,
    )
    assert verify_google_identity("signed").sub == "123"
    monkeypatch.setattr(
        "app.services.google_identity.google_id_token.verify_oauth2_token",
        lambda token, request, audience, clock_skew_in_seconds: (_ for _ in ()).throw(ValueError("bad signature")),
    )
    with pytest.raises(Exception) as invalid:
        verify_google_identity("bad")
    assert getattr(invalid.value, "error_code", None) == "INVALID_GOOGLE_TOKEN"
    monkeypatch.setattr(
        "app.services.google_identity.google_id_token.verify_oauth2_token",
        lambda token, request, audience, clock_skew_in_seconds: (_ for _ in ()).throw(GoogleAuthError("Wrong issuer")),
    )
    with pytest.raises(Exception) as issuer:
        verify_google_identity("signed")
    assert getattr(issuer.value, "error_code", None) == "INVALID_GOOGLE_TOKEN"
    monkeypatch.setattr(
        "app.services.google_identity.google_id_token.verify_oauth2_token",
        lambda token, request, audience, clock_skew_in_seconds: {"iss": "https://accounts.google.com", "sub": "123", "email": "cube@gmail.com", "email_verified": False},
    )
    with pytest.raises(Exception) as unverified:
        verify_google_identity("signed")
    assert getattr(unverified.value, "error_code", None) == "GOOGLE_EMAIL_UNVERIFIED"
