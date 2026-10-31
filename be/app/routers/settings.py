from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import SuccessResponse
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.services import settings as settings_service

router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "",
    response_model=SuccessResponse[SettingsResponse],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[SettingsResponse]:
    return settings_service.get_settings(current_user, db)


@router.put(
    "",
    response_model=SuccessResponse[SettingsResponse],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def update_settings(
    request: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[SettingsResponse]:
    return settings_service.update_settings(request, current_user, db)


@router.post(
    "/reset",
    response_model=SuccessResponse[SettingsResponse],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def reset_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[SettingsResponse]:
    return settings_service.reset_settings(current_user, db)
