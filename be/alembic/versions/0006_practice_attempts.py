"""Store timed practice attempts for personal stats and leaderboards.

Revision ID: 0006_practice_attempts
Revises: 0005_registration_otps
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_practice_attempts"
down_revision: str | None = "0005_registration_otps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "practice_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scramble", sa.JSON(), nullable=False),
        sa.Column("duration_cs", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_practice_attempts_user_id", "practice_attempts", ["user_id"])
    op.create_index("ix_practice_attempts_created_at", "practice_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_practice_attempts_created_at", table_name="practice_attempts")
    op.drop_index("ix_practice_attempts_user_id", table_name="practice_attempts")
    op.drop_table("practice_attempts")
