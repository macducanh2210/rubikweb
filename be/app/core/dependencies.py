from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.core.errors import APIError
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise APIError(401, "UNAUTHORIZED", "Chưa đăng nhập hoặc token không hợp lệ")

    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("Wrong token type")
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise APIError(
            401,
            "UNAUTHORIZED",
            "Chưa đăng nhập hoặc token không hợp lệ",
        ) from None

    user = db.get(User, user_id)
    if user is None or user.status == "deleted":
        raise APIError(
            401,
            "UNAUTHORIZED",
            "Chưa đăng nhập hoặc token không hợp lệ",
        )
    if user.status == "locked":
        raise APIError(403, "ACCOUNT_LOCKED", "Tài khoản đã bị khóa")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise APIError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này")
    return current_user


# Kept as a compatibility alias for routers implemented before A1.
require_bearer_token = get_current_user
