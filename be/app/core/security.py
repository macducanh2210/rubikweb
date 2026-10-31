from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_context.verify(plain_password, hashed_password)
    except (TypeError, ValueError):
        return False


def create_token(
    subject: str | int,
    token_type: Literal["access", "refresh", "reset"],
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "jti": uuid4().hex,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | int) -> str:
    return create_token(
        subject,
        "access",
        timedelta(minutes=settings.jwt_access_expire_minutes),
    )


def create_refresh_token(subject: str | int) -> str:
    return create_token(
        subject,
        "refresh",
        timedelta(days=settings.jwt_refresh_expire_days),
    )


def create_reset_token(subject: str | int, otp_id: int) -> str:
    return create_token(
        subject,
        "reset",
        timedelta(minutes=5),
        {"otp_id": otp_id},
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise ValueError("Invalid token") from exc
