"""Add Google account identity and permit passwordless accounts.

Revision ID: 0007_google_sign_in
Revises: 0006_practice_attempts
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_google_sign_in"
down_revision: str | None = "0006_practice_attempts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])


def downgrade() -> None:
    # Google-only accounts have no password; assign a random unusable hash before
    # restoring the old non-null constraint.
    import secrets

    connection = op.get_bind()
    for (user_id,) in connection.execute(sa.text("SELECT id FROM users WHERE password_hash IS NULL")):
        connection.execute(
            sa.text("UPDATE users SET password_hash = :value WHERE id = :user_id"),
            {"value": secrets.token_urlsafe(48), "user_id": user_id},
        )
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "google_sub")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)
