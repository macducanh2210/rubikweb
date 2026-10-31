from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import SuccessResponse
from app.schemas.rubik import SolveData, SolveRequest
from app.services import solve as solve_service

router = APIRouter(
    tags=["Solver"],
)


@router.post(
    "/solve",
    response_model=SuccessResponse[SolveData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def solve(
    request: SolveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[SolveData]:
    return solve_service.solve(request, current_user, db)
