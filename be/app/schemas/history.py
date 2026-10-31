from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import StrictInt, field_validator

from app.schemas.common import ContractModel, ORMModel
from app.schemas.rubik import AlgorithmName

HistoryStatus = Literal["completed", "abandoned"]


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class HistoryCreate(ContractModel):
    user_id: int
    solution_id: int
    start_time: datetime
    end_time: datetime
    duration: int
    status: HistoryStatus


class HistoryRequest(ContractModel):
    solution_id: StrictInt
    start_time: datetime
    end_time: datetime
    status: HistoryStatus

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def require_iso_string(cls, value: Any) -> Any:
        if not isinstance(value, str):
            raise ValueError("Thời gian phải là chuỗi ISO 8601")
        return value


class HistoryResponse(ORMModel):
    id: int
    solution_id: int
    duration: int
    status: HistoryStatus
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def created_at_utc(cls, value: datetime) -> datetime:
        return _ensure_utc(value)


class HistoryListItem(HistoryResponse):
    total_steps: int


class HistoryListData(ContractModel):
    items: list[HistoryListItem]
    total: int
    page: int
    limit: int


class HistorySolutionDetail(ContractModel):
    id: int
    moves: list[str]
    total_steps: int
    algorithm: AlgorithmName


class HistoryRubikStateDetail(ContractModel):
    id: int
    cube_state: dict[str, Any]
    face_images: dict[str, str]


class HistoryDetailData(ContractModel):
    id: int
    status: HistoryStatus
    duration: int
    start_time: datetime
    end_time: datetime
    created_at: datetime
    solution: HistorySolutionDetail
    rubik_state: HistoryRubikStateDetail

    @field_validator("start_time", "end_time", "created_at")
    @classmethod
    def times_utc(cls, value: datetime) -> datetime:
        return _ensure_utc(value)


class ProgressPoint(ContractModel):
    date: datetime
    duration: int

    @field_validator("date")
    @classmethod
    def date_utc(cls, value: datetime) -> datetime:
        return _ensure_utc(value)


class StatisticsData(ContractModel):
    total_solves: int
    average_time: float | None
    best_time: int | None
    average_steps: float | None
    progress: list[ProgressPoint]
    updated_at: datetime | None

    @field_validator("updated_at")
    @classmethod
    def updated_at_utc(cls, value: datetime | None) -> datetime | None:
        return _ensure_utc(value) if value is not None else None
