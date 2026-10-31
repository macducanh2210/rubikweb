from datetime import datetime, timezone
from typing import Literal

from pydantic import EmailStr, field_validator

from app.schemas.common import ContractModel, ORMModel


class UserCreate(ContractModel):
    username: str
    email: str
    password: str
    display_name: str


class UserResponse(ORMModel):
    id: int
    username: str
    email: EmailStr
    display_name: str
    avatar: str | None = None
    role: Literal["user", "admin"]
    status: Literal["active", "locked", "deleted"]
    created_at: datetime
    google_linked: bool
    has_password: bool

    @field_validator("created_at", mode="after")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class UserTokenProfile(ORMModel):
    id: int
    username: str
    email: EmailStr
    display_name: str
    avatar: str | None = None
    role: Literal["user", "admin"]


class ChangePasswordRequest(ContractModel):
    old_password: str
    new_password: str


class DeleteUserRequest(ContractModel):
    password: str
