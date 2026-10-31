from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.schemas.admin import AdminUserItem, AdminUserListData, AdminUserStatusData
from app.schemas.common import MessageData, SuccessResponse


def list_users(
    page: int,
    limit: int,
    search: str,
    include_deleted: bool,
    db: Session,
) -> SuccessResponse[AdminUserListData]:
    filters = []
    if not include_deleted:
        filters.append(User.status != "deleted")
    normalized_search = search.strip().lower()
    if normalized_search:
        pattern = f"%{normalized_search}%"
        filters.append(
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.email).like(pattern),
                func.lower(User.display_name).like(pattern),
            )
        )

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.scalars(
        select(User)
        .where(*filters)
        .order_by(User.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
    ).all()
    return SuccessResponse(
        data=AdminUserListData(
            items=[AdminUserItem.model_validate(user) for user in users],
            total=total,
            page=page,
            limit=limit,
        )
    )


def _get_modifiable_user(
    user_id: int,
    current_admin: User,
    db: Session,
) -> User:
    target = db.get(User, user_id)
    if target is None or target.status == "deleted":
        raise APIError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng")
    if target.id == current_admin.id:
        raise APIError(403, "CANNOT_MODIFY_SELF", "Admin không thể thao tác lên chính mình")
    if target.role == "admin":
        raise APIError(403, "CANNOT_MODIFY_ADMIN", "Không thể thao tác lên admin khác")
    return target


def set_user_status(
    user_id: int,
    status: str,
    current_admin: User,
    db: Session,
) -> SuccessResponse[AdminUserStatusData]:
    target = _get_modifiable_user(user_id, current_admin, db)
    target.status = status
    db.commit()
    return SuccessResponse(
        data=AdminUserStatusData(id=target.id, status=target.status)
    )


def delete_user(
    user_id: int,
    current_admin: User,
    db: Session,
) -> SuccessResponse[MessageData]:
    target = _get_modifiable_user(user_id, current_admin, db)
    target.status = "deleted"
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == target.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    db.commit()
    return SuccessResponse(data=MessageData(message="Đã xóa tài khoản"))
