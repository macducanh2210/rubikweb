"""Create the initial Rubik backend schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=30), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=50), nullable=False),
        sa.Column("avatar", sa.String(length=500), nullable=True),
        sa.Column(
            "role",
            sa.Enum("user", "admin", name="user_role"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "locked", "deleted", name="user_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_status", "users", ["status"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "rubik_faces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("face", sa.String(length=1), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=False),
        sa.Column("colors", sa.JSON(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rubik_faces_face", "rubik_faces", ["face"])
    op.create_index("ix_rubik_faces_user_id", "rubik_faces", ["user_id"])

    op.create_table(
        "rubik_states",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("cube_state", sa.JSON(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rubik_states_user_id", "rubik_states", ["user_id"])

    op.create_table(
        "rubik_state_faces",
        sa.Column("rubik_state_id", sa.Integer(), nullable=False),
        sa.Column("rubik_face_id", sa.Integer(), nullable=False),
        sa.Column("face", sa.String(length=1), nullable=False),
        sa.ForeignKeyConstraint(
            ["rubik_face_id"], ["rubik_faces.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["rubik_state_id"], ["rubik_states.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("rubik_state_id", "rubik_face_id"),
        sa.UniqueConstraint(
            "rubik_state_id", "face", name="uq_rubik_state_face"
        ),
    )

    op.create_table(
        "solutions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rubik_state_id", sa.Integer(), nullable=False),
        sa.Column("moves", sa.JSON(), nullable=False),
        sa.Column("total_steps", sa.Integer(), nullable=False),
        sa.Column("algorithm", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(
            ["rubik_state_id"], ["rubik_states.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_solutions_rubik_state_id", "solutions", ["rubik_state_id"])

    op.create_table(
        "histories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("solution_id", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("completed", "abandoned", name="history_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["solution_id"], ["solutions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_histories_created_at", "histories", ["created_at"])
    op.create_index("ix_histories_solution_id", "histories", ["solution_id"])
    op.create_index("ix_histories_status", "histories", ["status"])
    op.create_index("ix_histories_user_id", "histories", ["user_id"])

    op.create_table(
        "settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "solving_method",
            sa.Enum("KOCIEMBA", "CFOP", name="solving_method"),
            nullable=False,
        ),
        sa.Column(
            "theme",
            sa.Enum("light", "dark", name="theme"),
            nullable=False,
        ),
        sa.Column(
            "animation_speed",
            sa.Enum("slow", "normal", "fast", name="animation_speed"),
            nullable=False,
        ),
        sa.Column("camera_config", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_settings_user_id"),
    )
    op.create_index("ix_settings_user_id", "settings", ["user_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=512), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])
    op.create_index("ix_refresh_tokens_revoked", "refresh_tokens", ["revoked"])
    op.create_index("ix_refresh_tokens_token", "refresh_tokens", ["token"])
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "password_reset_otps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("otp_code", sa.String(length=6), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_otps_expires_at", "password_reset_otps", ["expires_at"])
    op.create_index("ix_password_reset_otps_used", "password_reset_otps", ["used"])
    op.create_index("ix_password_reset_otps_user_id", "password_reset_otps", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_password_reset_otps_user_id", table_name="password_reset_otps")
    op.drop_index("ix_password_reset_otps_used", table_name="password_reset_otps")
    op.drop_index("ix_password_reset_otps_expires_at", table_name="password_reset_otps")
    op.drop_table("password_reset_otps")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_revoked", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_settings_user_id", table_name="settings")
    op.drop_table("settings")

    op.drop_index("ix_histories_user_id", table_name="histories")
    op.drop_index("ix_histories_status", table_name="histories")
    op.drop_index("ix_histories_solution_id", table_name="histories")
    op.drop_index("ix_histories_created_at", table_name="histories")
    op.drop_table("histories")

    op.drop_index("ix_solutions_rubik_state_id", table_name="solutions")
    op.drop_table("solutions")
    op.drop_table("rubik_state_faces")

    op.drop_index("ix_rubik_states_user_id", table_name="rubik_states")
    op.drop_table("rubik_states")

    op.drop_index("ix_rubik_faces_user_id", table_name="rubik_faces")
    op.drop_index("ix_rubik_faces_face", table_name="rubik_faces")
    op.drop_table("rubik_faces")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_status", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
