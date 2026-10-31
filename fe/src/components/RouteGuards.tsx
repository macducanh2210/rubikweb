import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function AuthLoading() {
  return <p role="status">Đang kiểm tra phiên đăng nhập…</p>
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <AuthLoading />
  return isAuthenticated
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location }} />
}

export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <AuthLoading />
  return isAuthenticated ? <Navigate to="/quet" replace /> : <Outlet />
}

export function AdminRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <AuthLoading />
  if (!user) return <Navigate to="/login" replace />
  return user.role === 'admin' ? <Outlet /> : <Navigate to="/quet" replace />
}
