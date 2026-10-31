from datetime import datetime
from typing import Literal

from pydantic import EmailStr, field_validator

from app.schemas.common import ContractModel, ORMModel
from app.schemas.user import UserResponse


class AdminUserItem(ORMModel):
    id: int
    username: str
    email: EmailStr
    display_name: str
    role: Literal["user", "admin"]
    status: Literal["active", "locked", "deleted"]
    created_at: datetime

    @field_validator("created_at", mode="after")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        return UserResponse.ensure_utc(value)


class AdminUserListData(ContractModel):
    items: list[AdminUserItem]
    total: int
    page: int
    limit: int


class AdminUserStatusData(ContractModel):
    id: int
    status: Literal["active", "locked"]
