from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.history import History
    from app.models.rubik import RubikState


class Solution(Base):
    __tablename__ = "solutions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    rubik_state_id: Mapped[int] = mapped_column(
        ForeignKey("rubik_states.id", ondelete="CASCADE"), index=True
    )
    moves: Mapped[list[str]] = mapped_column(JSON)
    total_steps: Mapped[int] = mapped_column(Integer)
    algorithm: Mapped[str] = mapped_column(String(20))

    rubik_state: Mapped["RubikState"] = relationship(back_populates="solutions")
    histories: Mapped[list["History"]] = relationship(back_populates="solution")
