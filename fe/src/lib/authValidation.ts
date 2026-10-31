import type { ApiRequestError } from '../services/api'

export type RegisterField = 'username' | 'email' | 'display_name' | 'password' | 'confirmation'
export type RegisterFieldErrors = Partial<Record<RegisterField, string>>

const usernamePattern = /^[a-z0-9_]{3,30}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Nhập email.'
  if (!emailPattern.test(email.trim())) return 'Nhập email đúng định dạng.'
  return undefined
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Nhập mật khẩu.'
  if (password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.'
  return undefined
}

export function validateRegister(values: {
  username: string
  email: string
  display_name: string
  password: string
  confirmation: string
}): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {}
  if (!values.username) errors.username = 'Nhập tên đăng nhập.'
  else if (!usernamePattern.test(values.username)) {
    errors.username = 'Dùng 3–30 ký tự a–z, 0–9 hoặc dấu gạch dưới.'
  }
  errors.email = validateEmail(values.email)
  const displayName = values.display_name.trim()
  if (!displayName) errors.display_name = 'Nhập tên hiển thị.'
  else if (displayName.length > 50) errors.display_name = 'Tên hiển thị tối đa 50 ký tự.'
  errors.password = validatePassword(values.password)
  if (!values.confirmation) errors.confirmation = 'Nhập lại mật khẩu.'
  else if (values.confirmation !== values.password) errors.confirmation = 'Mật khẩu nhập lại chưa khớp.'
  return errors
}

export function registerApiFieldErrors(error: ApiRequestError): RegisterFieldErrors {
  if (error.kind !== 'api') return {}
  const fieldByCode: Record<string, RegisterField> = {
    INVALID_USERNAME_FORMAT: 'username',
    USERNAME_EXISTS: 'username',
    INVALID_EMAIL_FORMAT: 'email',
    EMAIL_EXISTS: 'email',
    WEAK_PASSWORD: 'password',
  }
  const field = fieldByCode[error.errorCode]
  if (field) return { [field]: error.message }

  if (error.errorCode !== 'VALIDATION_ERROR') return {}
  const fields = error.details?.fields
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return {}
  const errors: RegisterFieldErrors = {}
  for (const name of ['username', 'email', 'display_name', 'password'] as const) {
    const message = (fields as Record<string, unknown>)[name]
    if (typeof message === 'string') errors[name] = message
  }
  return errors
}
