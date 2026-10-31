"""Verify Google Identity Services ID tokens before account lookup."""

from dataclasses import dataclass

from email_validator import EmailNotValidError, validate_email
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2 import id_token as google_id_token
from requests.exceptions import RequestException

from app.core.config import settings
from app.core.errors import APIError


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str


GOOGLE_CLOCK_SKEW_SECONDS = 120


def verify_google_identity(token: str) -> GoogleIdentity:
    if not token or not token.strip():
        raise APIError(401, "INVALID_GOOGLE_TOKEN", "Phiên đăng nhập Google không hợp lệ")
    if not settings.google_client_id:
        raise APIError(503, "GOOGLE_NOT_CONFIGURED", "Đăng nhập Google chưa được cấu hình")
    try:
        claims = google_id_token.verify_oauth2_token(
            token, Request(), settings.google_client_id,
            clock_skew_in_seconds=GOOGLE_CLOCK_SKEW_SECONDS,
        )
    except (TransportError, RequestException):
        raise APIError(503, "GOOGLE_VERIFICATION_UNAVAILABLE", "Chưa thể xác minh với Google. Hãy thử lại") from None
    except (ValueError, TypeError, GoogleAuthError):
        raise APIError(401, "INVALID_GOOGLE_TOKEN", "Phiên đăng nhập Google không hợp lệ") from None

    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise APIError(401, "INVALID_GOOGLE_TOKEN", "Phiên đăng nhập Google không hợp lệ")
    if claims.get("email_verified") is not True:
        raise APIError(403, "GOOGLE_EMAIL_UNVERIFIED", "Google chưa xác minh địa chỉ email này")
    sub = claims.get("sub")
    email = claims.get("email")
    if not isinstance(sub, str) or not sub or not isinstance(email, str):
        raise APIError(401, "INVALID_GOOGLE_TOKEN", "Phiên đăng nhập Google không hợp lệ")
    try:
        normalized_email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise APIError(401, "INVALID_GOOGLE_TOKEN", "Phiên đăng nhập Google không hợp lệ") from None
    name = claims.get("name")
    return GoogleIdentity(
        sub=sub,
        email=normalized_email,
        name=name.strip()[:50] if isinstance(name, str) and name.strip() else normalized_email.split("@", 1)[0][:50],
    )
