from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services import email as email_service


@pytest.fixture()
def session_factory() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    try:
        yield factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[TestClient, None, None]:
    registration_codes: dict[str, str] = {}

    def fake_registration_send(recipient: str, otp_code: str) -> None:
        registration_codes[recipient] = otp_code

    monkeypatch.setattr(email_service, "send_registration_otp", fake_registration_send)
    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as test_client:
        test_client.registration_codes = registration_codes  # type: ignore[attr-defined]
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def sent_otps(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    messages: list[tuple[str, str]] = []

    def fake_send(recipient: str, otp_code: str) -> None:
        messages.append((recipient, otp_code))

    monkeypatch.setattr(email_service, "send_password_reset_otp", fake_send)
    return messages
