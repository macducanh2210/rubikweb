from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.models.settings import Settings
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.settings import SettingsResponse, SettingsUpdate

DEFAULT_CAMERA_CONFIG = {"resolution": "720p", "auto_focus": True}
VALID_VALUES = {
    "solving_method": {"KOCIEMBA"},
    "theme": {"light", "dark"},
    "animation_speed": {"slow", "normal", "fast"},
    "camera_config.resolution": {"480p", "720p", "1080p"},
}


def _invalid_setting(field: str) -> APIError:
    return APIError(
        400,
        "INVALID_SETTING_VALUE",
        "Giá trị cài đặt không hợp lệ",
        {"field": field},
    )


def _get_or_create(db: Session, user_id: int) -> Settings:
    user_settings = db.scalar(select(Settings).where(Settings.user_id == user_id))
    if user_settings is not None:
        return user_settings

    user_settings = Settings(
        user_id=user_id,
        solving_method="KOCIEMBA",
        theme="light",
        animation_speed="normal",
        camera_config=DEFAULT_CAMERA_CONFIG.copy(),
    )
    db.add(user_settings)
    try:
        db.commit()
        db.refresh(user_settings)
        return user_settings
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Settings).where(Settings.user_id == user_id))
        if existing is None:
            raise
        return existing


def _response(user_settings: Settings) -> SuccessResponse[SettingsResponse]:
    return SuccessResponse(data=SettingsResponse.model_validate(user_settings))


def get_settings(
    current_user: User,
    db: Session,
) -> SuccessResponse[SettingsResponse]:
    return _response(_get_or_create(db, current_user.id))


def update_settings(
    request: SettingsUpdate,
    current_user: User,
    db: Session,
) -> SuccessResponse[SettingsResponse]:
    user_settings = _get_or_create(db, current_user.id)

    for field in ("solving_method", "theme", "animation_speed"):
        if field not in request.model_fields_set:
            continue
        value = getattr(request, field)
        if value not in VALID_VALUES[field]:
            raise _invalid_setting(field)
        setattr(user_settings, field, value)

    if "camera_config" in request.model_fields_set:
        camera_update = request.camera_config
        if camera_update is None:
            raise _invalid_setting("camera_config")
        merged_camera = {
            **DEFAULT_CAMERA_CONFIG,
            **(user_settings.camera_config or {}),
        }
        if "resolution" in camera_update.model_fields_set:
            if camera_update.resolution not in VALID_VALUES["camera_config.resolution"]:
                raise _invalid_setting("camera_config.resolution")
            merged_camera["resolution"] = camera_update.resolution
        if "auto_focus" in camera_update.model_fields_set:
            if camera_update.auto_focus is None:
                raise _invalid_setting("camera_config.auto_focus")
            merged_camera["auto_focus"] = camera_update.auto_focus
        user_settings.camera_config = merged_camera

    db.commit()
    db.refresh(user_settings)
    return _response(user_settings)


def reset_settings(
    current_user: User,
    db: Session,
) -> SuccessResponse[SettingsResponse]:
    user_settings = _get_or_create(db, current_user.id)
    user_settings.solving_method = "KOCIEMBA"
    user_settings.theme = "light"
    user_settings.animation_speed = "normal"
    user_settings.camera_config = DEFAULT_CAMERA_CONFIG.copy()
    db.commit()
    db.refresh(user_settings)
    return _response(user_settings)
