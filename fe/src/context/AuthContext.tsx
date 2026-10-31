import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { tokenStorage } from '../lib/tokenStorage'
import { authService } from '../services/authService'
import { settingsService } from '../services/settingsService'
import { userService } from '../services/userService'
import { setTheme } from '../lib/theme'
import type { AuthUser, LoginRequest, RegisterRequest, UserProfile } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (request: LoginRequest) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  register: (request: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  updateUser: (profile: UserProfile) => void
  clearSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      if (!tokenStorage.getAccessToken() && !tokenStorage.getRefreshToken()) {
        if (active) setIsLoading(false)
        return
      }

      try {
        const profile = await userService.getCurrentUser()
        if (active) setUser(profile)
        try {
          const settings = await settingsService.getSettings()
          if (active) setTheme(settings.theme)
        } catch {
          // Giữ theme đã lưu cục bộ khi chưa đọc được cài đặt từ backend.
        }
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void restoreSession()
    return () => { active = false }
  }, [])

  async function login(request: LoginRequest): Promise<void> {
    const data = await authService.login(request)
    tokenStorage.save({ accessToken: data.access_token, refreshToken: data.refresh_token })
    setUser(data.user)
    try {
      const settings = await settingsService.getSettings()
      setTheme(settings.theme)
    } catch {
      // Đăng nhập vẫn thành công khi cài đặt tạm thời chưa tải được.
    }
  }

  async function register(request: RegisterRequest): Promise<void> {
    const data = await authService.register(request)
    tokenStorage.save({ accessToken: data.access_token, refreshToken: data.refresh_token })
    setUser(data.user)
    try {
      const settings = await settingsService.getSettings()
      setTheme(settings.theme)
    } catch {
      // Đăng ký vẫn thành công khi cài đặt tạm thời chưa tải được.
    }
  }

  async function googleLogin(idToken: string): Promise<void> {
    const data = await authService.googleLogin({ id_token: idToken })
    tokenStorage.save({ accessToken: data.access_token, refreshToken: data.refresh_token })
    setUser(data.user)
    try {
      const settings = await settingsService.getSettings()
      setTheme(settings.theme)
    } catch {
      // Đăng nhập vẫn thành công khi cài đặt tạm thời chưa tải được.
    }
  }

  function clearSession(): void {
    tokenStorage.clear()
    setUser(null)
  }

  async function logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken()
    try {
      if (refreshToken) await authService.logout({ refresh_token: refreshToken })
    } catch {
      // Hủy phiên cục bộ ngay cả khi backend không nhận được yêu cầu đăng xuất.
    } finally {
      clearSession()
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, isLoading, login, googleLogin, register, logout, updateUser: setUser, clearSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider chưa được khởi tạo')
  return context
}
