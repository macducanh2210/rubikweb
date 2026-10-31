from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.routers._docs import IMPLEMENTED_ERROR_RESPONSES
from app.schemas.auth import (
    AuthTokenData,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    LogoutRequest,
    OTPDispatchData,
    RefreshRequest,
    RegisterRequest,
    RegistrationOTPRequest,
    ResetPasswordRequest,
    ResetTokenData,
    TokenPairData,
    VerifyOTPRequest,
)
from app.schemas.common import MessageData, SuccessResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register/send-otp",
    response_model=SuccessResponse[OTPDispatchData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def send_registration_otp(
    request: RegistrationOTPRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[OTPDispatchData]:
    return auth_service.send_registration_otp(request, db)


@router.post(
    "/register",
    response_model=SuccessResponse[AuthTokenData],
    status_code=status.HTTP_201_CREATED,
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[AuthTokenData]:
    return auth_service.register(request, db)


@router.post(
    "/login",
    response_model=SuccessResponse[AuthTokenData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[AuthTokenData]:
    return auth_service.login(request, db)


@router.post(
    "/google",
    response_model=SuccessResponse[AuthTokenData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def google_login(
    request: GoogleAuthRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[AuthTokenData]:
    return auth_service.google_login(request, db)


@router.post(
    "/google/link",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def link_google(
    request: GoogleAuthRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return auth_service.link_google(request, current_user, db)


@router.post(
    "/refresh",
    response_model=SuccessResponse[TokenPairData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def refresh(
    request: RefreshRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[TokenPairData]:
    return auth_service.refresh(request, db)


@router.post(
    "/logout",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def logout(
    request: LogoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return auth_service.logout(request, current_user, db)


@router.post(
    "/forgot-password",
    response_model=SuccessResponse[OTPDispatchData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[OTPDispatchData]:
    return auth_service.forgot_password(request, db)


@router.post(
    "/verify-otp",
    response_model=SuccessResponse[ResetTokenData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def verify_otp(
    request: VerifyOTPRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[ResetTokenData]:
    return auth_service.verify_otp(request, db)


@router.post(
    "/reset-password",
    response_model=SuccessResponse[MessageData],
    responses=IMPLEMENTED_ERROR_RESPONSES,
)
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> SuccessResponse[MessageData]:
    return auth_service.reset_password(request, db)
