from typing import Literal

from pydantic import Field, StrictBool

from app.schemas.common import ContractModel, ORMModel


class CameraConfig(ContractModel):
    resolution: Literal["480p", "720p", "1080p"] = "720p"
    auto_focus: bool = True


class CameraConfigUpdate(ContractModel):
    resolution: str | None = None
    auto_focus: StrictBool | None = None


class SettingsCreate(ContractModel):
    user_id: int
    solving_method: Literal["KOCIEMBA"] = "KOCIEMBA"
    theme: Literal["light", "dark"] = "light"
    animation_speed: Literal["slow", "normal", "fast"] = "normal"
    camera_config: CameraConfig = Field(default_factory=CameraConfig)


class SettingsUpdate(ContractModel):
    solving_method: str | None = None
    theme: str | None = None
    animation_speed: str | None = None
    camera_config: CameraConfigUpdate | None = None


class SettingsResponse(ORMModel):
    solving_method: Literal["KOCIEMBA"]
    theme: Literal["light", "dark"]
    animation_speed: Literal["slow", "normal", "fast"]
    camera_config: CameraConfig
