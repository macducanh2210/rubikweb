from app.schemas.common import ErrorResponse

COMMON_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Dữ liệu yêu cầu không hợp lệ"},
    401: {"model": ErrorResponse, "description": "Chưa xác thực hoặc token lỗi"},
    403: {"model": ErrorResponse, "description": "Không đủ quyền"},
    404: {"model": ErrorResponse, "description": "Không tìm thấy tài nguyên"},
    409: {"model": ErrorResponse, "description": "Dữ liệu bị xung đột"},
    429: {"model": ErrorResponse, "description": "Vượt giới hạn yêu cầu"},
    500: {"model": ErrorResponse, "description": "Lỗi hệ thống"},
}

IMPLEMENTED_ERROR_RESPONSES = COMMON_ERROR_RESPONSES
