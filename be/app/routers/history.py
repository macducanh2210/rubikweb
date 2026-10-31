from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import SuccessResponse
from app.schemas.history import (
    HistoryDetailData,
    HistoryListData,
    HistoryRequest,
    HistoryResponse,
    StatisticsData,
)
from app.services import history as history_service

router = APIRouter(
    prefix="/history",
    tags=["History"],
)
statistics_router = APIRouter(
    tags=["Statistics"],
)


@router.post(
    "",
    response_model=SuccessResponse[HistoryResponse],
    status_code=status.HTTP_201_CREATED,
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def create_history(
    request: HistoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[HistoryResponse]:
    return history_service.create_history(request, current_user, db)


@router.get(
    "",
    response_model=SuccessResponse[HistoryListData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def list_history(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[HistoryListData]:
    return history_service.list_history(page, limit, current_user, db)


@router.get(
    "/{history_id}",
    response_model=SuccessResponse[HistoryDetailData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_history(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[HistoryDetailData]:
    return history_service.get_history(history_id, current_user, db)


@statistics_router.get(
    "/statistics",
    response_model=SuccessResponse[StatisticsData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_statistics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[StatisticsData]:
    return history_service.get_statistics(current_user, db)
