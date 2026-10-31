"""Normalize unique indexes declared by the SQLAlchemy models.

Revision ID: 0002_normalize_unique_indexes
Revises: 0001_initial
Create Date: 2026-10-07
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_normalize_unique_indexes"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_constraint("username", "users", type_="unique")
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.drop_index("ix_users_email", table_name="users")
    op.drop_constraint("email", "users", type_="unique")
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.drop_index("ix_refresh_tokens_token", table_name="refresh_tokens")
    op.drop_constraint("token", "refresh_tokens", type_="unique")
    op.create_index(
        "ix_refresh_tokens_token",
        "refresh_tokens",
        ["token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_token", table_name="refresh_tokens")
    op.create_unique_constraint("token", "refresh_tokens", ["token"])
    op.create_index(
        "ix_refresh_tokens_token",
        "refresh_tokens",
        ["token"],
        unique=False,
    )

    op.drop_index("ix_users_email", table_name="users")
    op.create_unique_constraint("email", "users", ["email"])
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.drop_index("ix_users_username", table_name="users")
    op.create_unique_constraint("username", "users", ["username"])
    op.create_index("ix_users_username", "users", ["username"], unique=False)
