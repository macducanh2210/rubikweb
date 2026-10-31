import logging
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


def error_content(
    error_code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content: dict[str, Any] = {
        "success": False,
        "error_code": error_code,
        "message": message,
    }
    if details is not None:
        content["details"] = details
    return content


async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_content(exc.error_code, exc.message, exc.details),
    )


async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: dict[str, str] = {}
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ()) if part != "body"]
        field = ".".join(location) or "body"
        error_type = str(error.get("type", ""))
        if error_type == "missing":
            message = f"Thiếu trường {field}"
        elif error_type == "json_invalid":
            message = "JSON không hợp lệ"
        elif error_type.startswith(("string_type", "int_", "bool_", "float_")):
            message = "Kiểu dữ liệu không hợp lệ"
        else:
            message = f"Giá trị {field} không hợp lệ"
        fields[field] = message
    return JSONResponse(
        status_code=400,
        content=error_content(
            "VALIDATION_ERROR",
            "Dữ liệu yêu cầu không hợp lệ",
            {"fields": fields},
        ),
    )


async def http_error_handler(
    _: Request, exc: StarletteHTTPException
) -> JSONResponse:
    if exc.status_code in (404, 405):
        return JSONResponse(
            status_code=404,
            content=error_content("NOT_FOUND", "Route hoặc tài nguyên không tồn tại"),
        )
    known_errors = {
        400: ("VALIDATION_ERROR", "Dữ liệu yêu cầu không hợp lệ"),
        401: ("UNAUTHORIZED", "Chưa đăng nhập hoặc token không hợp lệ"),
        403: ("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này"),
    }
    if exc.status_code in known_errors:
        code, message = known_errors[exc.status_code]
        return JSONResponse(
            status_code=exc.status_code,
            content=error_content(code, message),
        )
    return JSONResponse(
        status_code=500,
        content=error_content("INTERNAL_ERROR", "Lỗi hệ thống không lường trước"),
    )


async def internal_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled request exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_content("INTERNAL_ERROR", "Lỗi hệ thống không lường trước"),
    )
