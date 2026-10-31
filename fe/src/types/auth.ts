import type { ApiSuccess, MessageData } from './api'

export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'locked' | 'deleted'

export interface AuthUser {
  id: number
  username: string
  email: string
  display_name: string
  avatar: string | null
  role: UserRole
}

export interface UserProfile extends AuthUser {
  status: UserStatus
  created_at: string
  google_linked: boolean
  has_password: boolean
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  display_name: string
  otp_code: string
}

export interface SendRegistrationOtpRequest {
  email: string
}

export interface SendRegistrationOtpData extends MessageData {
  expires_in: number
}

export type SendRegistrationOtpResponse = ApiSuccess<SendRegistrationOtpData>

export interface LoginRequest {
  identifier: string
  password: string
}

export interface AuthData {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: AuthUser
}

export type RegisterResponse = ApiSuccess<AuthData>
export type LoginResponse = ApiSuccess<AuthData>

export interface GoogleAuthRequest {
  id_token: string
}

export type GoogleAuthResponse = ApiSuccess<AuthData>
export type GoogleLinkResponse = ApiSuccess<MessageData>

export interface RefreshRequest {
  refresh_token: string
}

export type RefreshData = Omit<AuthData, 'user'>
export type RefreshResponse = ApiSuccess<RefreshData>

export interface LogoutRequest extends RefreshRequest {}
export type LogoutResponse = ApiSuccess<MessageData>

export interface ForgotPasswordRequest {
  email: string
}

export interface ForgotPasswordData extends MessageData {
  expires_in: number
}

export type ForgotPasswordResponse = ApiSuccess<ForgotPasswordData>

export interface VerifyOtpRequest {
  email: string
  otp_code: string
}

export interface VerifyOtpData {
  reset_token: string
  expires_in: number
}

export type VerifyOtpResponse = ApiSuccess<VerifyOtpData>

export interface ResetPasswordRequest {
  reset_token: string
  new_password: string
}

export type ResetPasswordResponse = ApiSuccess<MessageData>
