from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.history import History
    from app.models.practice import PracticeAttempt
    from app.models.password_reset_otp import PasswordResetOTP
    from app.models.refresh_token import RefreshToken
    from app.models.rubik import RubikFace, RubikState
    from app.models.settings import Settings


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(50))
    avatar: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("user", "admin", name="user_role"), default="user"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "locked", "deleted", name="user_status"),
        default="active",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    rubik_faces: Mapped[list["RubikFace"]] = relationship(back_populates="user")
    rubik_states: Mapped[list["RubikState"]] = relationship(back_populates="user")
    histories: Mapped[list["History"]] = relationship(back_populates="user")
    practice_attempts: Mapped[list["PracticeAttempt"]] = relationship(back_populates="user")
    settings: Mapped["Settings | None"] = relationship(
        back_populates="user", uselist=False
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user"
    )
    password_reset_otps: Mapped[list["PasswordResetOTP"]] = relationship(
        back_populates="user"
    )

    @property
    def google_linked(self) -> bool:
        return self.google_sub is not None

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None
