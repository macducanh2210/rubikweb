"""Retire CFOP and normalize existing settings to Kociemba.

Revision ID: 0003_kociemba_only
Revises: 0002_normalize_unique_indexes
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_kociemba_only"
down_revision: str | None = "0002_normalize_unique_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE settings SET solving_method = 'KOCIEMBA' WHERE solving_method = 'CFOP'"))
    if op.get_bind().dialect.name in {"mysql", "mariadb"}:
        op.alter_column(
            "settings",
            "solving_method",
            existing_type=sa.Enum("KOCIEMBA", "CFOP", name="solving_method"),
            type_=sa.Enum("KOCIEMBA", name="solving_method"),
            existing_nullable=False,
        )


def downgrade() -> None:
    if op.get_bind().dialect.name in {"mysql", "mariadb"}:
        op.alter_column(
            "settings",
            "solving_method",
            existing_type=sa.Enum("KOCIEMBA", name="solving_method"),
            type_=sa.Enum("KOCIEMBA", "CFOP", name="solving_method"),
            existing_nullable=False,
        )
