/** Thành công và lỗi theo API Contract v5. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'INVALID_USERNAME_FORMAT'
  | 'INVALID_EMAIL_FORMAT'
  | 'USERNAME_EXISTS'
  | 'EMAIL_EXISTS'
  | 'WEAK_PASSWORD'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_REFRESH_TOKEN'
  | 'EMAIL_NOT_FOUND'
  | 'OTP_RATE_LIMITED'
  | 'EMAIL_SEND_FAILED'
  | 'INVALID_OTP'
  | 'OTP_EXPIRED'
  | 'OTP_MAX_ATTEMPTS'
  | 'INVALID_RESET_TOKEN'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'WRONG_OLD_PASSWORD'
  | 'INVALID_SETTING_VALUE'
  | 'USER_NOT_FOUND'
  | 'CANNOT_MODIFY_SELF'
  | 'CANNOT_MODIFY_ADMIN'
  | 'INVALID_FACE'
  | 'CUBE_NOT_DETECTED'
  | 'LOW_CONFIDENCE'
  | 'FACE_NOT_FOUND'
  | 'MISSING_FACE'
  | 'DUPLICATE_FACE'
  | 'FACE_MISMATCH'
  | 'INVALID_COLOR_ARRAY'
  | 'INVALID_CUBE_STATE'
  | 'UNSOLVABLE_STATE'
  | 'RUBIK_STATE_NOT_FOUND'
  | 'SOLUTION_NOT_FOUND'
  | 'INVALID_TIME_RANGE'
  | 'HISTORY_NOT_FOUND'

export interface ApiFailure {
  success: false
  error_code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface MessageData {
  message: string
}
