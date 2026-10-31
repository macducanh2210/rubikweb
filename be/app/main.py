from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import (
    APIError,
    api_error_handler,
    http_error_handler,
    internal_error_handler,
    validation_error_handler,
)
from app.routers import admin, auth, detect, history, practice, settings as settings_router, solve, users

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend API aligned with API Contract v5.6.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(Exception, internal_error_handler)

uploads_directory = Path(__file__).resolve().parent.parent / "uploads"
uploads_directory.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_directory), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(settings_router.router)
app.include_router(admin.router)
app.include_router(detect.router)
app.include_router(solve.router)
app.include_router(history.router)
app.include_router(history.statistics_router)
app.include_router(practice.router)


def contract_openapi() -> dict:
    if app.openapi_schema is not None:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation.get("responses", {}).pop("422", None)
    app.openapi_schema = schema
    return schema


app.openapi = contract_openapi


@app.get("/health", tags=["System"])
def health() -> dict[str, str]:
    return {"status": "ok"}
