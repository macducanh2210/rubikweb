from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import SuccessResponse
from app.schemas.daily_challenge import DailyAttemptData, DailyAttemptRequest, DailyChallengeData, DailyLeaderboardData
from app.schemas.practice import (
    PracticeAttemptData,
    PracticeAttemptListData,
    PracticeAttemptRequest,
    PracticeLeaderboardData,
)
from app.services import practice as practice_service
from app.services import daily_challenge as daily_service

router = APIRouter(prefix="/practice", tags=["Practice"])


@router.post(
    "/attempts",
    response_model=SuccessResponse[PracticeAttemptData],
    status_code=status.HTTP_201_CREATED,
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def create_attempt(
    request: PracticeAttemptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[PracticeAttemptData]:
    return practice_service.create_attempt(request, current_user, db)


@router.get(
    "/attempts",
    response_model=SuccessResponse[PracticeAttemptListData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def list_attempts(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[PracticeAttemptListData]:
    return practice_service.list_attempts(page, limit, current_user, db)


@router.get(
    "/leaderboard",
    response_model=SuccessResponse[PracticeLeaderboardData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_leaderboard(
    limit: int = Query(default=10, ge=1, le=100),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[PracticeLeaderboardData]:
    return practice_service.get_leaderboard(limit, db)


@router.get(
    "/daily-challenge",
    response_model=SuccessResponse[DailyChallengeData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_daily_challenge(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[DailyChallengeData]:
    return daily_service.get_challenge(current_user, db)


@router.post(
    "/daily-challenge/attempts",
    response_model=SuccessResponse[DailyAttemptData],
    status_code=status.HTTP_201_CREATED,
    responses={**IMPLEMENTED_ERROR_RESPONSES, 200: {"model": SuccessResponse[DailyAttemptData], "description": "Lượt thi đã lưu trước đó"}},
)
def create_daily_attempt(
    request: DailyAttemptRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[DailyAttemptData]:
    result, created = daily_service.create_attempt(request, current_user, db)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return result


@router.get(
    "/daily-challenge/leaderboard",
    response_model=SuccessResponse[DailyLeaderboardData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def get_daily_leaderboard(
    challenge_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[DailyLeaderboardData]:
    return daily_service.get_leaderboard(challenge_id, limit, current_user, db)
