import re
from datetime import datetime, timezone

from pydantic import Field, StrictInt, field_validator

from app.schemas.common import ContractModel

MOVE_PATTERN = re.compile(r"[UDLRFB](?:'|2)?\Z")


class PracticeAttemptRequest(ContractModel):
    scramble: list[str] = Field(min_length=20, max_length=20)
    duration_cs: StrictInt = Field(ge=1, le=360000)

    @field_validator("scramble")
    @classmethod
    def valid_moves(cls, value: list[str]) -> list[str]:
        if any(MOVE_PATTERN.fullmatch(move) is None for move in value):
            raise ValueError("Scramble chỉ gồm 20 ký hiệu xoay in hoa hợp lệ")
        return value


class PracticeAttemptData(ContractModel):
    id: int
    scramble: list[str]
    duration_cs: int
    ao5_cs: int | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def created_at_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class PracticeAttemptListData(ContractModel):
    items: list[PracticeAttemptData]
    total: int
    page: int
    limit: int
    best_single_cs: int | None
    current_ao5_cs: int | None
    best_ao5_cs: int | None


class PracticeLeaderboardEntry(ContractModel):
    rank: int
    user_id: int
    username: str
    display_name: str
    duration_cs: int
    total_attempts: int


class PracticeLeaderboardData(ContractModel):
    single: list[PracticeLeaderboardEntry]
    ao5: list[PracticeLeaderboardEntry]
