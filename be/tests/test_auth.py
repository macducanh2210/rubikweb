from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import create_token, decode_token, verify_password
from app.models.password_reset_otp import PasswordResetOTP
from app.models.registration_otp import RegistrationOTP
from app.models.refresh_token import RefreshToken
from app.models.user import User

REGISTER_PAYLOAD = {
    "username": "nguyenvana",
    "email": "user@example.com",
    "password": "password123",
    "display_name": "Nguyễn Văn A",
    "otp_code": "123456",
}


def register(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload = {**REGISTER_PAYLOAD, **overrides}
    assert client.post("/auth/register/send-otp", json={"email": payload["email"]}).status_code == 200
    response = client.post("/auth/register", json={**payload, "otp_code": client.registration_codes[payload["email"]]})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def assert_error(
    response: Any,
    status_code: int,
    error_code: str,
    *,
    has_details: bool = False,
) -> None:
    assert response.status_code == status_code
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == error_code
    assert isinstance(body["message"], str) and body["message"]
    assert ("details" in body) is has_details


def test_register_matches_contract_and_hashes_password(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    sent = client.post("/auth/register/send-otp", json={"email": REGISTER_PAYLOAD["email"]})
    assert sent.status_code == 200
    with session_factory() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
    response = client.post(
        "/auth/register",
        json={**REGISTER_PAYLOAD, "otp_code": client.registration_codes[REGISTER_PAYLOAD["email"]], "ignored_by_contract": "ignored"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert set(body) == {"success", "data"}
    assert set(body["data"]) == {
        "access_token",
        "refresh_token",
        "token_type",
        "user",
    }
    assert body["data"]["token_type"] == "bearer"
    assert body["data"]["user"] == {
        "id": 1,
        "username": "nguyenvana",
        "email": "user@example.com",
        "display_name": "Nguyễn Văn A",
        "avatar": None,
        "role": "user",
    }
    assert decode_token(body["data"]["access_token"])["type"] == "access"
    assert decode_token(body["data"]["refresh_token"])["type"] == "refresh"

    with session_factory() as db:
        user = db.scalar(select(User).where(User.username == "nguyenvana"))
        assert user is not None
        assert user.password_hash.startswith("$2")
        assert user.password_hash != REGISTER_PAYLOAD["password"]
        assert verify_password(REGISTER_PAYLOAD["password"], user.password_hash)
        stored = db.scalar(
            select(RefreshToken).where(
                RefreshToken.token == body["data"]["refresh_token"]
            )
        )
        assert stored is not None and stored.revoked is False


def test_registration_requires_emailed_otp_and_is_single_use(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    email = REGISTER_PAYLOAD["email"]
    missing = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": "123456"})
    assert_error(missing, 400, "INVALID_OTP")
    sent = client.post("/auth/register/send-otp", json={"email": email})
    assert sent.status_code == 200
    assert sent.json()["data"]["expires_in"] == 300
    code = client.registration_codes[email]
    with session_factory() as db:
        pending = db.scalar(select(RegistrationOTP).where(RegistrationOTP.email == email))
        assert pending is not None and pending.otp_hash != code
    wrong_email = client.post("/auth/register", json={**REGISTER_PAYLOAD, "email": "other@example.com", "otp_code": code})
    assert_error(wrong_email, 400, "INVALID_OTP")
    success = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": code})
    assert success.status_code == 201
    reused = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": code})
    assert_error(reused, 409, "USERNAME_EXISTS")
    with session_factory() as db:
        assert db.scalar(select(func.count()).select_from(RegistrationOTP)) == 0


def test_registration_otp_rejects_invalid_or_existing_email(client: TestClient) -> None:
    invalid = client.post("/auth/register/send-otp", json={"email": "not-an-email"})
    assert_error(invalid, 400, "INVALID_EMAIL_FORMAT")
    register(client)
    existing = client.post("/auth/register/send-otp", json={"email": REGISTER_PAYLOAD["email"]})
    assert_error(existing, 409, "EMAIL_EXISTS")


def test_registration_otp_rate_limit_resend_and_attempts(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    email = REGISTER_PAYLOAD["email"]
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    first_code = client.registration_codes[email]
    limited = client.post("/auth/register/send-otp", json={"email": email})
    assert_error(limited, 429, "OTP_RATE_LIMITED")
    with session_factory() as db:
        pending = db.scalar(select(RegistrationOTP).where(RegistrationOTP.email == email))
        assert pending is not None
        pending.expires_at -= timedelta(seconds=61)
        db.commit()
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    second_code = client.registration_codes[email]
    prior_attempts = 0
    if first_code != second_code:
        invalidated = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": first_code})
        assert_error(invalidated, 400, "INVALID_OTP")
        prior_attempts = 1
    wrong_code = "000000" if second_code != "000000" else "000001"
    for _ in range(4 - prior_attempts):
        invalid = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": wrong_code})
        assert_error(invalid, 400, "INVALID_OTP")
    blocked = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": wrong_code})
    assert_error(blocked, 429, "OTP_MAX_ATTEMPTS")
    correct_after_limit = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": second_code})
    assert_error(correct_after_limit, 429, "OTP_MAX_ATTEMPTS")


def test_registration_otp_expiry_and_smtp_failure(
    client: TestClient,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    email = REGISTER_PAYLOAD["email"]
    def fail_send(_: str, __: str) -> None:
        raise RuntimeError("SMTP unavailable")
    monkeypatch.setattr("app.services.email.send_registration_otp", fail_send)
    failed = client.post("/auth/register/send-otp", json={"email": email})
    assert_error(failed, 500, "EMAIL_SEND_FAILED")
    with session_factory() as db:
        assert db.scalar(select(func.count()).select_from(RegistrationOTP)) == 0
    monkeypatch.setattr("app.services.email.send_registration_otp", lambda recipient, code: client.registration_codes.__setitem__(recipient, code))
    assert client.post("/auth/register/send-otp", json={"email": email}).status_code == 200
    code = client.registration_codes[email]
    with session_factory() as db:
        pending = db.scalar(select(RegistrationOTP).where(RegistrationOTP.email == email))
        assert pending is not None
        pending.expires_at -= timedelta(minutes=10)
        db.commit()
    expired = client.post("/auth/register", json={**REGISTER_PAYLOAD, "otp_code": code})
    assert_error(expired, 400, "OTP_EXPIRED")


@pytest.mark.parametrize(
    ("payload", "error_code", "has_details"),
    [
        ({"email": None}, "VALIDATION_ERROR", True),
        ({"username": "A!"}, "INVALID_USERNAME_FORMAT", False),
        ({"email": "not-an-email"}, "INVALID_EMAIL_FORMAT", False),
        ({"password": "short"}, "WEAK_PASSWORD", False),
        ({"display_name": "   "}, "VALIDATION_ERROR", True),
    ],
)
def test_register_validation_errors(
    client: TestClient,
    payload: dict[str, Any],
    error_code: str,
    has_details: bool,
) -> None:
    request = {**REGISTER_PAYLOAD, **payload}
    response = client.post("/auth/register", json=request)
    assert_error(response, 400, error_code, has_details=has_details)


def test_register_missing_field_is_common_validation_error(client: TestClient) -> None:
    payload = {key: value for key, value in REGISTER_PAYLOAD.items() if key != "email"}
    response = client.post("/auth/register", json=payload)

    assert_error(response, 400, "VALIDATION_ERROR", has_details=True)
    assert response.json()["details"] == {"fields": {"email": "Thiếu trường email"}}


def test_register_rejects_duplicate_username_and_email(client: TestClient) -> None:
    register(client)

    duplicate_username = client.post(
        "/auth/register",
        json={**REGISTER_PAYLOAD, "email": "another@example.com"},
    )
    assert_error(duplicate_username, 409, "USERNAME_EXISTS")

    duplicate_email = client.post(
        "/auth/register",
        json={**REGISTER_PAYLOAD, "username": "another_user"},
    )
    assert_error(duplicate_email, 409, "EMAIL_EXISTS")


def test_login_by_email_or_username_and_rejects_wrong_password(
    client: TestClient,
) -> None:
    register(client)

    by_email = client.post(
        "/auth/login",
        json={"identifier": "user@example.com", "password": "password123"},
    )
    assert by_email.status_code == 200
    assert by_email.json()["data"]["user"]["username"] == "nguyenvana"

    by_username = client.post(
        "/auth/login",
        json={"identifier": "nguyenvana", "password": "password123"},
    )
    assert by_username.status_code == 200

    wrong_password = client.post(
        "/auth/login",
        json={"identifier": "nguyenvana", "password": "incorrect"},
    )
    assert_error(wrong_password, 401, "INVALID_CREDENTIALS")


def test_login_handles_locked_and_deleted_accounts(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    register(client)
    with session_factory() as db:
        user = db.scalar(select(User).where(User.username == "nguyenvana"))
        assert user is not None
        user.status = "locked"
        db.commit()

    locked = client.post(
        "/auth/login",
        json={"identifier": "nguyenvana", "password": "password123"},
    )
    assert_error(locked, 403, "ACCOUNT_LOCKED")

    with session_factory() as db:
        user = db.scalar(select(User).where(User.username == "nguyenvana"))
        assert user is not None
        user.status = "deleted"
        db.commit()

    deleted = client.post(
        "/auth/login",
        json={"identifier": "nguyenvana", "password": "password123"},
    )
    assert_error(deleted, 401, "INVALID_CREDENTIALS")


def test_refresh_rotates_token_and_rejects_replay(client: TestClient) -> None:
    auth = register(client)
    response = client.post(
        "/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert set(data) == {"access_token", "refresh_token", "token_type"}
    assert data["token_type"] == "bearer"
    assert data["refresh_token"] != auth["refresh_token"]

    replay = client.post(
        "/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert_error(replay, 401, "INVALID_REFRESH_TOKEN")


def test_refresh_rejects_expired_token(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    auth = register(client)
    user_id = int(decode_token(auth["access_token"])["sub"])
    expired = create_token(user_id, "refresh", timedelta(seconds=-1))
    with session_factory() as db:
        db.add(
            RefreshToken(
                user_id=user_id,
                token=expired,
                revoked=False,
                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
        db.commit()

    response = client.post("/auth/refresh", json={"refresh_token": expired})
    assert_error(response, 401, "INVALID_REFRESH_TOKEN")


def test_logout_revokes_refresh_token(client: TestClient) -> None:
    auth = register(client)
    response = client.post(
        "/auth/logout",
        headers=bearer(auth["access_token"]),
        json={"refresh_token": auth["refresh_token"]},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"message": "Đăng xuất thành công"},
    }
    rejected = client.post(
        "/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert_error(rejected, 401, "INVALID_REFRESH_TOKEN")


def test_logout_requires_valid_non_expired_access_token(client: TestClient) -> None:
    auth = register(client)
    missing = client.post(
        "/auth/logout",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert_error(missing, 401, "UNAUTHORIZED")

    user_id = int(decode_token(auth["access_token"])["sub"])
    expired_access = create_token(user_id, "access", timedelta(seconds=-1))
    expired = client.post(
        "/auth/logout",
        headers=bearer(expired_access),
        json={"refresh_token": auth["refresh_token"]},
    )
    assert_error(expired, 401, "UNAUTHORIZED")


def test_forgot_password_sends_six_digit_otp_and_rate_limits(
    client: TestClient,
    sent_otps: list[tuple[str, str]],
) -> None:
    register(client)
    response = client.post(
        "/auth/forgot-password",
        json={"email": "user@example.com"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"message": "Đã gửi mã OTP tới email", "expires_in": 300},
    }
    assert len(sent_otps) == 1
    assert sent_otps[0][0] == "user@example.com"
    assert len(sent_otps[0][1]) == 6 and sent_otps[0][1].isdigit()

    limited = client.post(
        "/auth/forgot-password",
        json={"email": "user@example.com"},
    )
    assert_error(limited, 429, "OTP_RATE_LIMITED")


def test_forgot_password_rejects_unknown_email(client: TestClient) -> None:
    response = client.post(
        "/auth/forgot-password",
        json={"email": "missing@example.com"},
    )
    assert_error(response, 404, "EMAIL_NOT_FOUND")


def test_forgot_password_reports_smtp_failure_and_rolls_back(
    client: TestClient,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register(client)

    def fail_send(_: str, __: str) -> None:
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr("app.services.email.send_password_reset_otp", fail_send)
    response = client.post(
        "/auth/forgot-password",
        json={"email": "user@example.com"},
    )
    assert_error(response, 500, "EMAIL_SEND_FAILED")

    with session_factory() as db:
        assert db.scalar(select(func.count()).select_from(PasswordResetOTP)) == 0


def request_otp(
    client: TestClient,
    sent_otps: list[tuple[str, str]],
) -> str:
    response = client.post(
        "/auth/forgot-password",
        json={"email": "user@example.com"},
    )
    assert response.status_code == 200
    return sent_otps[-1][1]


def test_verify_otp_returns_reset_token(
    client: TestClient,
    sent_otps: list[tuple[str, str]],
) -> None:
    register(client)
    otp_code = request_otp(client, sent_otps)
    response = client.post(
        "/auth/verify-otp",
        json={"email": "user@example.com", "otp_code": otp_code},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    data = response.json()["data"]
    assert set(data) == {"reset_token", "expires_in"}
    assert data["expires_in"] == 300
    assert decode_token(data["reset_token"])["type"] == "reset"


def test_verify_otp_enforces_expiry_and_max_attempts(
    client: TestClient,
    session_factory: sessionmaker[Session],
    sent_otps: list[tuple[str, str]],
) -> None:
    register(client)
    otp_code = request_otp(client, sent_otps)
    wrong_otp = "000000" if otp_code != "000000" else "000001"

    for _ in range(4):
        invalid = client.post(
            "/auth/verify-otp",
            json={"email": "user@example.com", "otp_code": wrong_otp},
        )
        assert_error(invalid, 400, "INVALID_OTP")
    max_attempts = client.post(
        "/auth/verify-otp",
        json={"email": "user@example.com", "otp_code": wrong_otp},
    )
    assert_error(max_attempts, 429, "OTP_MAX_ATTEMPTS")

    with session_factory() as db:
        otp = db.scalar(select(PasswordResetOTP))
        assert otp is not None
        otp.attempts = 0
        otp.expires_at = otp.expires_at - timedelta(minutes=10)
        db.commit()

    expired = client.post(
        "/auth/verify-otp",
        json={"email": "user@example.com", "otp_code": sent_otps[-1][1]},
    )
    assert_error(expired, 400, "OTP_EXPIRED")


def test_reset_password_is_single_use_and_revokes_refresh_tokens(
    client: TestClient,
    sent_otps: list[tuple[str, str]],
) -> None:
    initial_auth = register(client)
    otp_code = request_otp(client, sent_otps)
    verified = client.post(
        "/auth/verify-otp",
        json={"email": "user@example.com", "otp_code": otp_code},
    )
    reset_token = verified.json()["data"]["reset_token"]

    response = client.post(
        "/auth/reset-password",
        json={"reset_token": reset_token, "new_password": "newpassword123"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"message": "Đặt lại mật khẩu thành công"},
    }

    old_login = client.post(
        "/auth/login",
        json={"identifier": "user@example.com", "password": "password123"},
    )
    assert_error(old_login, 401, "INVALID_CREDENTIALS")
    new_login = client.post(
        "/auth/login",
        json={"identifier": "user@example.com", "password": "newpassword123"},
    )
    assert new_login.status_code == 200

    old_refresh = client.post(
        "/auth/refresh",
        json={"refresh_token": initial_auth["refresh_token"]},
    )
    assert_error(old_refresh, 401, "INVALID_REFRESH_TOKEN")

    reused = client.post(
        "/auth/reset-password",
        json={"reset_token": reset_token, "new_password": "anotherpassword"},
    )
    assert_error(reused, 401, "INVALID_RESET_TOKEN")


def test_reset_password_rejects_weak_and_expired_token(
    client: TestClient,
    session_factory: sessionmaker[Session],
    sent_otps: list[tuple[str, str]],
) -> None:
    auth = register(client)
    otp_code = request_otp(client, sent_otps)
    verified = client.post(
        "/auth/verify-otp",
        json={"email": "user@example.com", "otp_code": otp_code},
    )
    valid_reset_token = verified.json()["data"]["reset_token"]

    weak = client.post(
        "/auth/reset-password",
        json={"reset_token": valid_reset_token, "new_password": "short"},
    )
    assert_error(weak, 400, "WEAK_PASSWORD")

    with session_factory() as db:
        otp = db.scalar(select(PasswordResetOTP))
        assert otp is not None
        expired_token = create_token(
            int(decode_token(auth["access_token"])["sub"]),
            "reset",
            timedelta(seconds=-1),
            {"otp_id": otp.id},
        )
    expired = client.post(
        "/auth/reset-password",
        json={"reset_token": expired_token, "new_password": "newpassword123"},
    )
    assert_error(expired, 401, "INVALID_RESET_TOKEN")


def test_get_current_user_and_require_admin_dependencies(
    client: TestClient,
    session_factory: sessionmaker[Session],
) -> None:
    auth = register(client)
    protected = client.get("/settings", headers=bearer(auth["access_token"]))
    assert protected.status_code == 200
    assert protected.json()["data"]["theme"] == "light"

    forbidden = client.get("/admin/users", headers=bearer(auth["access_token"]))
    assert_error(forbidden, 403, "FORBIDDEN")

    with session_factory() as db:
        user = db.scalar(select(User).where(User.username == "nguyenvana"))
        assert user is not None
        user.role = "admin"
        db.commit()
    allowed = client.get("/admin/users", headers=bearer(auth["access_token"]))
    assert allowed.status_code == 200
    assert allowed.json()["data"]["total"] == 1
