from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.security import hash_password, verify_password
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.common import MessageData, SuccessResponse
from app.schemas.user import ChangePasswordRequest, DeleteUserRequest, UserResponse

AVATAR_DIR = Path(__file__).resolve().parents[2] / "uploads" / "avatars"
MAX_AVATAR_BYTES = 2 * 1024 * 1024
AVATAR_TYPES = {
    "image/jpeg": ("jpg", lambda content: content.startswith(b"\xff\xd8\xff")),
    "image/png": ("png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
}


def _validation_error(field: str, message: str) -> APIError:
    return APIError(
        400,
        "VALIDATION_ERROR",
        "Dữ liệu yêu cầu không hợp lệ",
        {"fields": {field: message}},
    )


def _user_response(user: User) -> SuccessResponse[UserResponse]:
    return SuccessResponse(data=UserResponse.model_validate(user))


def get_me(current_user: User) -> SuccessResponse[UserResponse]:
    return _user_response(current_user)


def update_me(
    current_user: User,
    display_name: str | None,
    avatar: UploadFile | None,
    base_url: str,
    db: Session,
) -> SuccessResponse[UserResponse]:
    if display_name is not None:
        normalized_name = display_name.strip()
        if not normalized_name:
            raise _validation_error("display_name", "Thiếu trường display_name")
        if len(normalized_name) > 50:
            raise _validation_error(
                "display_name",
                "Tên hiển thị tối đa 50 ký tự",
            )
        current_user.display_name = normalized_name

    new_avatar_path: Path | None = None
    if avatar is not None:
        content_type = (avatar.content_type or "").lower()
        avatar_type = AVATAR_TYPES.get(content_type)
        if avatar_type is None:
            raise APIError(400, "INVALID_FILE_TYPE", "Avatar phải là file JPG hoặc PNG")
        extension, has_valid_signature = avatar_type
        content = avatar.file.read(MAX_AVATAR_BYTES + 1)
        if len(content) > MAX_AVATAR_BYTES:
            raise APIError(400, "FILE_TOO_LARGE", "Avatar không được vượt quá 2MB")
        if not content or not has_valid_signature(content):
            raise APIError(400, "INVALID_FILE_TYPE", "Nội dung file ảnh không hợp lệ")

        AVATAR_DIR.mkdir(parents=True, exist_ok=True)
        new_avatar_path = AVATAR_DIR / f"{current_user.id}.{extension}"
        temp_path = AVATAR_DIR / f".{current_user.id}-{uuid4().hex}.tmp"
        temp_path.write_bytes(content)
        temp_path.replace(new_avatar_path)

        for old_extension in {"jpg", "png"} - {extension}:
            old_path = AVATAR_DIR / f"{current_user.id}.{old_extension}"
            old_path.unlink(missing_ok=True)
        current_user.avatar = (
            f"{base_url.rstrip('/')}/uploads/avatars/{new_avatar_path.name}"
        )

    try:
        db.commit()
        db.refresh(current_user)
    except Exception:
        db.rollback()
        if new_avatar_path is not None:
            new_avatar_path.unlink(missing_ok=True)
        raise
    return _user_response(current_user)


def change_password(
    request: ChangePasswordRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[MessageData]:
    if not request.old_password or not request.old_password.strip():
        raise _validation_error("old_password", "Thiếu trường old_password")
    if not request.new_password or not request.new_password.strip():
        raise _validation_error("new_password", "Thiếu trường new_password")
    if not verify_password(request.old_password, current_user.password_hash):
        raise APIError(401, "WRONG_OLD_PASSWORD", "Mật khẩu hiện tại không chính xác")
    if len(request.new_password) < 8:
        raise APIError(400, "WEAK_PASSWORD", "Mật khẩu mới phải có ít nhất 8 ký tự")

    current_user.password_hash = hash_password(request.new_password)
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked.is_(False),
        )
        .values(revoked=True)
    )
    db.commit()
    return SuccessResponse(data=MessageData(message="Đổi mật khẩu thành công"))


def delete_me(
    request: DeleteUserRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[MessageData]:
    if not request.password or not request.password.strip():
        raise _validation_error("password", "Thiếu trường password")
    if not verify_password(request.password, current_user.password_hash):
        raise APIError(401, "INVALID_CREDENTIALS", "Mật khẩu xác nhận không chính xác")
    current_user.status = "deleted"
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    db.commit()
    return SuccessResponse(data=MessageData(message="Đã xóa tài khoản"))
