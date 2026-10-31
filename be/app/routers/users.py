from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import MessageData, SuccessResponse
from app.schemas.user import ChangePasswordRequest, DeleteUserRequest, UserResponse
from app.services import users as users_service

router = APIRouter(
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/me",
    response_model=SuccessResponse[UserResponse],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_me(
    current_user: User = Depends(get_current_user),
) -> SuccessResponse[UserResponse]:
    return users_service.get_me(current_user)


@router.put(
    "/me",
    response_model=SuccessResponse[UserResponse],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def update_me(
    request: Request,
    display_name: Annotated[str | None, Form()] = None,
    avatar: Annotated[UploadFile | None, File()] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[UserResponse]:
    return users_service.update_me(
        current_user,
        display_name,
        avatar,
        str(request.base_url),
        db,
    )


@router.put(
    "/me/password",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return users_service.change_password(request, current_user, db)


@router.delete(
    "/me",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def delete_me(
    request: DeleteUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return users_service.delete_me(request, current_user, db)
