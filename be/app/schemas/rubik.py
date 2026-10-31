from datetime import datetime
from typing import Any, Literal

from pydantic import Field, StrictInt

from app.schemas.common import ContractModel, ORMModel

FaceName = Literal["U", "D", "F", "B", "L", "R"]
ColorName = Literal["white", "yellow", "red", "orange", "blue", "green"]
AlgorithmName = Literal["KOCIEMBA"]


class RubikFaceCreate(ContractModel):
    user_id: int
    face: FaceName
    image_url: str
    colors: list[ColorName] = Field(min_length=9, max_length=9)
    confidence_score: float = Field(ge=0, le=1)


class RubikFaceResponse(ORMModel):
    id: int
    user_id: int
    face: FaceName
    image_url: str
    colors: list[ColorName]
    confidence_score: float
    created_at: datetime


class SingleFaceData(ContractModel):
    face_id: int
    face: FaceName
    image_url: str
    colors: list[ColorName]
    confidence_score: float


class FinalizeFaceInput(ContractModel):
    face: str
    face_id: StrictInt
    colors: list[Any] | None = None


class FinalizeRequest(ContractModel):
    faces: list[FinalizeFaceInput]


class ManualCubeRequest(ContractModel):
    cube_state: dict[str, list[Any]]


class CubeState(ContractModel):
    U: list[ColorName]
    D: list[ColorName]
    F: list[ColorName]
    B: list[ColorName]
    L: list[ColorName]
    R: list[ColorName]


class RubikStateCreate(ContractModel):
    user_id: int
    cube_state: dict[str, Any]
    confidence_score: float = Field(ge=0, le=1)


class RubikStateResponse(ORMModel):
    id: int
    user_id: int
    cube_state: dict[str, Any]
    confidence_score: float
    created_at: datetime


class FinalizeData(ContractModel):
    rubik_state_id: int
    cube_state: dict[str, list[ColorName]]
    confidence_score: float


class SolutionCreate(ContractModel):
    rubik_state_id: int
    moves: list[str]
    total_steps: int = Field(ge=0)
    algorithm: AlgorithmName


class SolutionResponse(ORMModel):
    id: int
    rubik_state_id: int
    moves: list[str]
    total_steps: int
    algorithm: AlgorithmName


class SolveRequest(ContractModel):
    rubik_state_id: StrictInt


class SolveData(ContractModel):
    solution_id: int
    moves: list[str]
    total_steps: int
    algorithm: AlgorithmName
