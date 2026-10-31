"""Store email verification codes for pending registrations.

Revision ID: 0005_registration_otps
Revises: 0004_utc_created_at
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_registration_otps"
down_revision: str | None = "0004_utc_created_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "registration_otps",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("otp_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_registration_otps_email", "registration_otps", ["email"], unique=True)
    op.create_index("ix_registration_otps_expires_at", "registration_otps", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_registration_otps_expires_at", table_name="registration_otps")
    op.drop_index("ix_registration_otps_email", table_name="registration_otps")
    op.drop_table("registration_otps")
