from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.common import SuccessResponse
from app.schemas.rubik import (
    FinalizeData,
    FinalizeRequest,
    ManualCubeRequest,
    SingleFaceData,
)
from app.services import detect as detect_service

router = APIRouter(
    prefix="/detect",
    tags=["Detection"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "/single-face",
    response_model=SuccessResponse[SingleFaceData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def detect_single_face(
    request: Request,
    face: Annotated[str, Form()],
    image: Annotated[UploadFile, File()],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[SingleFaceData]:
    return detect_service.single_face(face, image, current_user, str(request.base_url), db)


@router.post(
    "/finalize",
    response_model=SuccessResponse[FinalizeData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def finalize_detection(
    request: FinalizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[FinalizeData]:
    return detect_service.finalize(request, current_user, db)


@router.post(
    "/manual",
    response_model=SuccessResponse[FinalizeData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def create_manual_cube(
    request: ManualCubeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[FinalizeData]:
    return detect_service.manual(request, current_user, db)
