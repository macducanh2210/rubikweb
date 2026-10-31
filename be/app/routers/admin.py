from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.admin import AdminUserListData, AdminUserStatusData
from app.schemas.common import MessageData, SuccessResponse
from app.services import admin as admin_service

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get(
    "/users",
    response_model=SuccessResponse[AdminUserListData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str = Query(default=""),
    include_deleted: bool = Query(default=False),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SuccessResponse[AdminUserListData]:
    _ = current_admin
    return admin_service.list_users(page, limit, search, include_deleted, db)


@router.put(
    "/users/{user_id}/lock",
    response_model=SuccessResponse[AdminUserStatusData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def lock_user(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SuccessResponse[AdminUserStatusData]:
    return admin_service.set_user_status(user_id, "locked", current_admin, db)


@router.put(
    "/users/{user_id}/unlock",
    response_model=SuccessResponse[AdminUserStatusData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def unlock_user(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SuccessResponse[AdminUserStatusData]:
    return admin_service.set_user_status(user_id, "active", current_admin, db)


@router.delete(
    "/users/{user_id}",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def delete_user(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return admin_service.delete_user(user_id, current_admin, db)
