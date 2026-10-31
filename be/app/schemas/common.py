from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ORMModel(ContractModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)


class SuccessResponse(ContractModel, Generic[T]):
    success: bool = True
    data: T


class ErrorResponse(ContractModel):
    success: bool = False
    error_code: str
    message: str
    details: dict[str, Any] | None = None


class MessageData(ContractModel):
    message: str
