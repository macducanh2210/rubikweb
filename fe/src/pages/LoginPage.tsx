import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Field, Button, FormNotice } from '../components/ui'
import { AuthLink } from '../components/AuthLink'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'

export function LoginPage() {
  const { login, googleLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [identifierError, setIdentifierError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const resetCompleted = (location.state as { passwordReset?: boolean } | null)?.passwordReset === true

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missingIdentifier = identifier.trim() ? '' : 'Nhập email hoặc tên đăng nhập.'
    const missingPassword = password ? '' : 'Nhập mật khẩu.'
    setIdentifierError(missingIdentifier)
    setPasswordError(missingPassword)
    if (missingIdentifier || missingPassword) return
    setLoading(true)
    setError('')
    try {
      await login({ identifier: identifier.trim(), password })
      navigate('/quet', { replace: true })
    } catch (cause) {
      const apiError = getApiError(cause)
      setError(apiError.kind === 'api' && apiError.errorCode === 'INVALID_CREDENTIALS'
        ? 'Email, tên đăng nhập hoặc mật khẩu không đúng.'
        : apiError.kind === 'api' && apiError.errorCode === 'ACCOUNT_LOCKED'
          ? 'Tài khoản đã bị khóa. Liên hệ quản trị viên để được hỗ trợ.'
          : apiError.message)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle(idToken: string) {
    if (googleLoading) return
    setGoogleLoading(true)
    setError('')
    try {
      await googleLogin(idToken)
      navigate('/quet', { replace: true })
    } catch (cause) {
      setError(getApiError(cause).message)
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-title font-semibold">Đăng nhập</h1>
        <p className="mt-2 text-small text-muted">Tiếp tục quét và giải khối Rubik của bạn.</p>
      </div>
      <form className="grid gap-5" onSubmit={submit} noValidate>
        {resetCompleted && <FormNotice tone="success" message="Đã đặt lại mật khẩu" />}
        <Field id="login-identifier" label="Email hoặc tên đăng nhập" autoComplete="username" required value={identifier} error={identifierError} onChange={(event) => { setIdentifier(event.target.value); setIdentifierError('') }} />
        <Field id="login-password" label="Mật khẩu" type="password" autoComplete="current-password" required value={password} error={passwordError} onChange={(event) => { setPassword(event.target.value); setPasswordError('') }} />
        <AuthLink to="/forgot-password" className="justify-self-end">Quên mật khẩu?</AuthLink>
        {error && <FormNotice message={error} />}
        <Button type="submit" loading={loading}>Đăng nhập</Button>
      </form>
      {import.meta.env.VITE_GOOGLE_CLIENT_ID && <div className="grid gap-4 border-t border-line pt-5">
        <p className="text-small text-muted">Hoặc đăng nhập bằng Google</p>
        <GoogleSignInButton onCredential={(token) => void signInWithGoogle(token)} busy={loading || googleLoading} text="signin_with" />
      </div>}
      <p className="text-small text-muted">
        Chưa có tài khoản? <AuthLink to="/register">Đăng ký</AuthLink>
      </p>
    </div>
  )
}
