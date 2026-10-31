"""Exercise only revision 0008 against a disposable SQLite database."""

from datetime import date
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.exc import IntegrityError


def test_daily_migration_upgrade_constraints_and_downgrade(tmp_path: Path) -> None:
    revision_path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0008_daily_challenges.py"
    spec = spec_from_file_location("daily_migration", revision_path)
    assert spec is not None and spec.loader is not None
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite+pysqlite:///{tmp_path / 'migration.db'}")
    try:
        with engine.begin() as connection:
            connection.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
            connection.execute(sa.text("INSERT INTO users(id) VALUES (1)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            inspector = sa.inspect(connection)
            assert {constraint["name"] for constraint in inspector.get_unique_constraints("daily_challenges")} == {"uq_daily_challenges_date"}
            assert {constraint["name"] for constraint in inspector.get_unique_constraints("daily_challenge_attempts")} == {
                "uq_daily_attempt_challenge_user", "uq_daily_attempt_user_client",
            }
            metadata = sa.MetaData()
            challenges = sa.Table("daily_challenges", metadata, autoload_with=connection)
            attempts = sa.Table("daily_challenge_attempts", metadata, autoload_with=connection)
            connection.execute(challenges.insert().values(id=1, date=date(2026, 10, 11), scramble=["R", "U"] * 10))
            connection.execute(challenges.insert().values(id=2, date=date(2026, 10, 12), scramble=["R", "U"] * 10))
            connection.execute(attempts.insert().values(id=1, challenge_id=1, user_id=1, client_attempt_id="one", duration_cs=1234))
            for statement in (
                challenges.insert().values(date=date(2026, 10, 11), scramble=[]),
                attempts.insert().values(challenge_id=1, user_id=1, client_attempt_id="two", duration_cs=1000),
                attempts.insert().values(challenge_id=2, user_id=1, client_attempt_id="one", duration_cs=1000),
            ):
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(statement)
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert set(sa.inspect(connection).get_table_names()) == {"users"}
    finally:
        engine.dispose()
