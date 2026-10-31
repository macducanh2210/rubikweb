"""Persist a solution for an owned, validated Rubik state."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.rubik import RubikState
from app.models.settings import Settings
from app.models.solution import Solution
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.rubik import SolveData, SolveRequest
from app.services.solver import solve_cube_state


def solve(
    request: SolveRequest,
    current_user: User,
    db: Session,
) -> SuccessResponse[SolveData]:
    state = db.scalar(
        select(RubikState).where(
            RubikState.id == request.rubik_state_id,
            RubikState.user_id == current_user.id,
        )
    )
    if state is None:
        raise APIError(404, "RUBIK_STATE_NOT_FOUND", "Không tìm thấy trạng thái Rubik")

    user_settings = db.scalar(select(Settings).where(Settings.user_id == current_user.id))
    if user_settings is not None and user_settings.solving_method != "KOCIEMBA":
        raise APIError(400, "INVALID_SETTING_VALUE", "Giá trị cài đặt không hợp lệ", {"field": "solving_method"})

    moves = solve_cube_state(state.cube_state)
    solution = Solution(
        rubik_state_id=state.id,
        moves=moves,
        total_steps=len(moves),
        algorithm="KOCIEMBA",
    )
    db.add(solution)
    db.commit()
    db.refresh(solution)
    return SuccessResponse(
        data=SolveData(
            solution_id=solution.id,
            moves=moves,
            total_steps=len(moves),
            algorithm="KOCIEMBA",
        )
    )
