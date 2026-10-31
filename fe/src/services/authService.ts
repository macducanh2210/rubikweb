import { api } from './api'
import type {
  LoginRequest,
  LoginResponse,
  GoogleAuthRequest,
  GoogleAuthResponse,
  GoogleLinkResponse,
  LogoutRequest,
  LogoutResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  RegisterRequest,
  RegisterResponse,
  SendRegistrationOtpRequest,
  SendRegistrationOtpResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '../types'

export const authService = {
  async sendRegistrationOtp(request: SendRegistrationOtpRequest) {
    const response = await api.post<SendRegistrationOtpResponse>('/auth/register/send-otp', request)
    return response.data.data
  },
  async login(request: LoginRequest) {
    const response = await api.post<LoginResponse>('/auth/login', request)
    return response.data.data
  },
  async googleLogin(request: GoogleAuthRequest) {
    const response = await api.post<GoogleAuthResponse>('/auth/google', request)
    return response.data.data
  },
  async linkGoogle(request: GoogleAuthRequest) {
    const response = await api.post<GoogleLinkResponse>('/auth/google/link', request)
    return response.data.data
  },
  async register(request: RegisterRequest) {
    const response = await api.post<RegisterResponse>('/auth/register', request)
    return response.data.data
  },
  async logout(request: LogoutRequest) {
    const response = await api.post<LogoutResponse>('/auth/logout', request)
    return response.data.data
  },
  async forgotPassword(request: ForgotPasswordRequest) {
    const response = await api.post<ForgotPasswordResponse>('/auth/forgot-password', request)
    return response.data.data
  },
  async verifyOtp(request: VerifyOtpRequest) {
    const response = await api.post<VerifyOtpResponse>('/auth/verify-otp', request)
    return response.data.data
  },
  async resetPassword(request: ResetPasswordRequest) {
    const response = await api.post<ResetPasswordResponse>('/auth/reset-password', request)
    return response.data.data
  },
}
