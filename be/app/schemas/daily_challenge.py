from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import Field, StrictInt, field_validator

from app.schemas.common import ContractModel


class DailyAttemptRequest(ContractModel):
    challenge_id: StrictInt = Field(ge=1)
    duration_cs: StrictInt = Field(ge=1, le=360000)
    client_attempt_id: UUID


class DailyAttemptData(ContractModel):
    id: int
    duration_cs: int
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def created_at_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class DailyChallengeData(ContractModel):
    id: int
    date: date
    timezone: Literal["Asia/Ho_Chi_Minh"] = "Asia/Ho_Chi_Minh"
    scramble: list[str]
    starts_at: datetime
    ends_at: datetime
    server_time: datetime
    my_attempt: DailyAttemptData | None


class DailyLeaderboardEntry(ContractModel):
    rank: int
    user_id: int
    username: str
    display_name: str
    duration_cs: int
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def created_at_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class DailyLeaderboardData(ContractModel):
    challenge_id: int
    date: date
    items: list[DailyLeaderboardEntry]
    total_participants: int
    my_rank: int | None
