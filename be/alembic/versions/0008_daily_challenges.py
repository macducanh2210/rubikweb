"""Store daily shared scrambles and one official result per account.

Revision ID: 0008_daily_challenges
Revises: 0007_google_sign_in
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_daily_challenges"
down_revision: str | None = "0007_google_sign_in"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_challenges",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("scramble", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("date", name="uq_daily_challenges_date"),
    )
    op.create_table(
        "daily_challenge_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("challenge_id", sa.Integer(), sa.ForeignKey("daily_challenges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_attempt_id", sa.String(36), nullable=False),
        sa.Column("duration_cs", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("challenge_id", "user_id", name="uq_daily_attempt_challenge_user"),
        sa.UniqueConstraint("user_id", "client_attempt_id", name="uq_daily_attempt_user_client"),
    )
    op.create_index("ix_daily_challenge_attempts_user_id", "daily_challenge_attempts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_daily_challenge_attempts_user_id", table_name="daily_challenge_attempts")
    op.drop_table("daily_challenge_attempts")
    op.drop_table("daily_challenges")
