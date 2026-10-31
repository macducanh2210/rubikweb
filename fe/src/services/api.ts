import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { tokenStorage } from '../lib/tokenStorage'
import type { ApiFailure, RefreshResponse } from '../types'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

export type ApiRequestError =
  | {
      kind: 'api'
      status: number
      errorCode: string
      message: string
      details?: Record<string, unknown>
    }
  | { kind: 'network'; message: string }
  | { kind: 'unexpected'; message: string }

const baseURL = import.meta.env.VITE_API_BASE_URL

export const api = axios.create({ baseURL })
const refreshClient = axios.create({ baseURL })

const authPathsWithoutRefresh = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/register/send-otp',
  '/auth/forgot-password',
  '/auth/verify-otp',
  '/auth/reset-password',
])

let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = tokenStorage.getRefreshToken()
      if (!refreshToken) throw new Error('Không có refresh token')

      const response = await refreshClient.post<RefreshResponse>('/auth/refresh', {
        refresh_token: refreshToken,
      })

      // Không phục hồi phiên đã bị đăng xuất trong lúc request refresh chạy.
      if (tokenStorage.getRefreshToken() !== refreshToken) {
        throw new Error('Phiên đăng nhập đã thay đổi')
      }

      tokenStorage.save({
        accessToken: response.data.data.access_token,
        refreshToken: response.data.data.refresh_token,
      })
      return response.data.data.access_token
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

function endSession(): void {
  tokenStorage.clear()
  if (window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

api.interceptors.request.use((config) => {
  const accessToken = tokenStorage.getAccessToken()
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error)
    }

    // Một số 401 là lỗi nghiệp vụ (mật khẩu cũ/sai mật khẩu xác nhận), không phải token hết hạn.
    if (isApiFailure(error.response.data) && error.response.data.error_code !== 'UNAUTHORIZED') {
      return Promise.reject(error)
    }

    const config = error.config as RetryableConfig
    const path = config.url?.split('?')[0] ?? ''
    if (authPathsWithoutRefresh.has(path)) {
      return Promise.reject(error)
    }
    if (config._retry) {
      endSession()
      return Promise.reject(error)
    }

    config._retry = true

    try {
      const sentToken = AxiosHeaders.from(config.headers).get('Authorization')
      const currentToken = tokenStorage.getAccessToken()
      const accessToken = currentToken && sentToken !== `Bearer ${currentToken}`
        ? currentToken
        : await refreshAccessToken()

      config.headers = AxiosHeaders.from(config.headers)
      config.headers.set('Authorization', `Bearer ${accessToken}`)

      // Nếu refresh rotation diễn ra trong lúc đăng xuất, dùng token mới.
      if (path === '/auth/logout') {
        config.data = JSON.stringify({ refresh_token: tokenStorage.getRefreshToken() })
      }

      return api(config)
    } catch (refreshError) {
      endSession()
      return Promise.reject(refreshError)
    }
  },
)

function isApiFailure(value: unknown): value is ApiFailure {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  return response.success === false
    && typeof response.error_code === 'string'
    && typeof response.message === 'string'
}

/** Chuyển lỗi Axios thành kết quả có kiểu, phân biệt API và kết nối. */
export function getApiError(error: unknown): ApiRequestError {
  if (axios.isAxiosError(error)) {
    const { response } = error
    if (response && isApiFailure(response.data)) {
      const failure = response.data
      return {
        kind: 'api',
        status: response.status,
        errorCode: failure.error_code,
        message: failure.message,
        ...(failure.details ? { details: failure.details } : {}),
      }
    }
    if (!response && error.code !== 'ERR_CANCELED') {
      return { kind: 'network', message: 'Không kết nối được máy chủ. Kiểm tra backend rồi thử lại.' }
    }
  }
  return { kind: 'unexpected', message: 'Có lỗi không xác định. Vui lòng thử lại.' }
}
