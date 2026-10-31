from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Settings(Base):
    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("user_id", name="uq_settings_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    solving_method: Mapped[str] = mapped_column(
        Enum("KOCIEMBA", name="solving_method"), default="KOCIEMBA"
    )
    theme: Mapped[str] = mapped_column(
        Enum("light", "dark", name="theme"), default="light"
    )
    animation_speed: Mapped[str] = mapped_column(
        Enum("slow", "normal", "fast", name="animation_speed"),
        default="normal",
    )
    camera_config: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=lambda: {"resolution": "720p", "auto_focus": True},
    )

    user: Mapped["User"] = relationship(back_populates="settings")
