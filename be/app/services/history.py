"""History persistence, ownership checks, and completed-solve statistics."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.history import History
from app.models.rubik import RubikState
from app.models.solution import Solution
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.history import (
    HistoryDetailData,
    HistoryListData,
    HistoryListItem,
    HistoryRequest,
    HistoryResponse,
    HistoryRubikStateDetail,
    HistorySolutionDetail,
    ProgressPoint,
    StatisticsData,
)


def _utc_naive(value: datetime) -> datetime:
    """MySQL DATETIME is timezone-naive; persist UTC consistently."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def create_history(
    request: HistoryRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[HistoryResponse]:
    solution = db.scalar(
        select(Solution)
        .join(RubikState, Solution.rubik_state_id == RubikState.id)
        .where(
            Solution.id == request.solution_id,
            RubikState.user_id == current_user.id,
        )
    )
    if solution is None:
        raise APIError(404, "SOLUTION_NOT_FOUND", "Không tìm thấy lời giải")

    start_time = _utc_naive(request.start_time)
    end_time = _utc_naive(request.end_time)
    elapsed = (end_time - start_time).total_seconds()
    if elapsed <= 0:
        raise APIError(400, "INVALID_TIME_RANGE", "Thời gian kết thúc phải sau thời gian bắt đầu")

    history = History(
        user_id=current_user.id,
        solution_id=solution.id,
        start_time=start_time,
        end_time=end_time,
        duration=int(elapsed),
        status=request.status,
    )
    db.add(history)
    db.commit()
    db.refresh(history)
    return SuccessResponse(data=HistoryResponse.model_validate(history))


def list_history(
    page: int,
    limit: int,
    current_user: User,
    db: Session,
) -> SuccessResponse[HistoryListData]:
    total = db.scalar(
        select(func.count(History.id)).where(History.user_id == current_user.id)
    ) or 0
    rows = db.execute(
        select(History, Solution.total_steps)
        .join(Solution, History.solution_id == Solution.id)
        .where(History.user_id == current_user.id)
        .order_by(History.created_at.desc(), History.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    ).all()
    return SuccessResponse(
        data=HistoryListData(
            items=[
                HistoryListItem(
                    id=history.id,
                    solution_id=history.solution_id,
                    duration=history.duration,
                    status=history.status,
                    created_at=history.created_at,
                    total_steps=total_steps,
                )
                for history, total_steps in rows
            ],
            total=total,
            page=page,
            limit=limit,
        )
    )


def get_history(
    history_id: int,
    current_user: User,
    db: Session,
) -> SuccessResponse[HistoryDetailData]:
    history = db.scalar(
        select(History).where(
            History.id == history_id,
            History.user_id == current_user.id,
        )
    )
    if history is None:
        raise APIError(404, "HISTORY_NOT_FOUND", "Không tìm thấy lịch sử giải")

    solution = history.solution
    state = solution.rubik_state
    return SuccessResponse(
        data=HistoryDetailData(
            id=history.id,
            status=history.status,
            duration=history.duration,
            start_time=history.start_time,
            end_time=history.end_time,
            created_at=history.created_at,
            solution=HistorySolutionDetail(
                id=solution.id,
                moves=solution.moves,
                total_steps=solution.total_steps,
                algorithm=solution.algorithm,
            ),
            rubik_state=HistoryRubikStateDetail(
                id=state.id,
                cube_state=state.cube_state,
                face_images={face.face: face.image_url for face in state.source_faces},
            ),
        )
    )


def get_statistics(
    current_user: User,
    db: Session,
) -> SuccessResponse[StatisticsData]:
    completed = (
        History.user_id == current_user.id,
        History.status == "completed",
    )
    total, average_time, best_time, average_steps, updated_at = db.execute(
        select(
            func.count(History.id),
            func.avg(History.duration),
            func.min(History.duration),
            func.avg(Solution.total_steps),
            func.max(History.created_at),
        )
        .join(Solution, History.solution_id == Solution.id)
        .where(*completed)
    ).one()
    recent = db.execute(
        select(History.created_at, History.duration)
        .where(*completed)
        .order_by(History.created_at.desc(), History.id.desc())
        .limit(50)
    ).all()
    return SuccessResponse(
        data=StatisticsData(
            total_solves=total,
            average_time=float(average_time) if average_time is not None else None,
            best_time=best_time,
            average_steps=float(average_steps) if average_steps is not None else None,
            progress=[
                ProgressPoint(date=created_at, duration=duration)
                for created_at, duration in reversed(recent)
            ],
            updated_at=updated_at,
        )
    )
