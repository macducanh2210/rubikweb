from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import models so Alembic can discover every table through Base.metadata.
from app import models as _models  # noqa: E402,F401
