from datetime import datetime

from pydantic import Field

from app.schemas.common import ContractModel, ORMModel
from app.schemas.user import UserCreate, UserTokenProfile


class RegisterRequest(UserCreate):
    otp_code: str


class RegistrationOTPRequest(ContractModel):
    email: str


class LoginRequest(ContractModel):
    identifier: str
    password: str


class GoogleAuthRequest(ContractModel):
    id_token: str


class RefreshRequest(ContractModel):
    refresh_token: str


class LogoutRequest(RefreshRequest):
    pass


class ForgotPasswordRequest(ContractModel):
    email: str


class VerifyOTPRequest(ContractModel):
    email: str
    otp_code: str


class ResetPasswordRequest(ContractModel):
    reset_token: str
    new_password: str


class AuthTokenData(ContractModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserTokenProfile


class TokenPairData(ContractModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class OTPDispatchData(ContractModel):
    message: str
    expires_in: int


class ResetTokenData(ContractModel):
    reset_token: str
    expires_in: int


class RefreshTokenCreate(ContractModel):
    user_id: int
    token: str
    revoked: bool = False
    expires_at: datetime


class RefreshTokenResponse(ORMModel):
    id: int
    user_id: int
    token: str
    revoked: bool
    expires_at: datetime


class PasswordResetOTPCreate(ContractModel):
    user_id: int
    otp_code: str = Field(min_length=6, max_length=6)
    attempts: int = 0
    expires_at: datetime
    used: bool = False


class PasswordResetOTPResponse(ORMModel):
    id: int
    user_id: int
    otp_code: str
    attempts: int
    expires_at: datetime
    used: bool
