from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Table,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.solution import Solution
    from app.models.user import User


rubik_state_faces = Table(
    "rubik_state_faces",
    Base.metadata,
    Column("rubik_state_id", ForeignKey("rubik_states.id", ondelete="CASCADE"), primary_key=True),
    Column("rubik_face_id", ForeignKey("rubik_faces.id", ondelete="RESTRICT"), primary_key=True),
    Column("face", String(1), nullable=False),
    UniqueConstraint("rubik_state_id", "face", name="uq_rubik_state_face"),
)


class RubikFace(Base):
    __tablename__ = "rubik_faces"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    face: Mapped[str] = mapped_column(String(1), index=True)
    image_url: Mapped[str] = mapped_column(String(500))
    colors: Mapped[list[str]] = mapped_column(JSON)
    confidence_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="rubik_faces")
    rubik_states: Mapped[list["RubikState"]] = relationship(
        secondary=rubik_state_faces,
        back_populates="source_faces",
    )


class RubikState(Base):
    __tablename__ = "rubik_states"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    cube_state: Mapped[dict[str, Any]] = mapped_column(JSON)
    confidence_score: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="rubik_states")
    source_faces: Mapped[list[RubikFace]] = relationship(
        secondary=rubik_state_faces,
        back_populates="rubik_states",
    )
    solutions: Mapped[list["Solution"]] = relationship(
        back_populates="rubik_state"
    )
