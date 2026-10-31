from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    app_name: str = "Rubik Recognition and Solver API"
    database_url: str = (
        "mysql+pymysql://rubik:rubik@localhost:3306/"
        "rubik_db?charset=utf8mb4"
    )
    jwt_secret: str = "replace-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 7
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    google_client_id: str = ""
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)

    @field_validator("smtp_port", mode="before")
    @classmethod
    def use_default_smtp_port_when_empty(cls, value: object) -> object:
        """Allow an intentionally unconfigured SMTP block in .env."""
        return 587 if value in (None, "") else value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()


settings = get_settings()
