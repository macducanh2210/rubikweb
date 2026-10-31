import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, FormNotice } from '../components/ui'
import { AuthLink } from '../components/AuthLink'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { useAuth } from '../context/AuthContext'
import { getApiError } from '../services/api'
import { authService } from '../services/authService'
import { registerApiFieldErrors, validateRegister, type RegisterFieldErrors } from '../lib/authValidation'

export function RegisterPage() {
  const { register, googleLogin } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [notice, setNotice] = useState('')
  const [sentEmail, setSentEmail] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (step !== 'otp') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const resendRemaining = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  function clearFieldError(field: keyof RegisterFieldErrors) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function sendCode() {
    const values = { username, email, display_name: displayName, password, confirmation }
    const errors = validateRegister(values)
    setFieldErrors(errors)
    setError('')
    if (Object.values(errors).some(Boolean)) {
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const data = await authService.sendRegistrationOtp({ email: email.trim() })
      const sentAt = Date.now()
      setNow(sentAt)
      setExpiresAt(sentAt + data.expires_in * 1000)
      setResendAt(sentAt + 60_000)
      setOtpCode('')
      setOtpError('')
      setSentEmail(email.trim().toLowerCase())
      setNotice(data.message)
      setStep('otp')
    } catch (cause) {
      const apiError = getApiError(cause)
      const mapped = registerApiFieldErrors(apiError)
      setFieldErrors(mapped)
      if (Object.values(mapped).some(Boolean)) setStep('details')
      else setError(apiError.message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError('Nhập mã gồm đúng 6 chữ số.')
      return
    }
    if (remaining === 0) {
      setOtpError('Mã đã hết hạn. Hãy gửi lại mã.')
      return
    }
    setLoading(true)
    setError('')
    setOtpError('')
    try {
      await register({ username, email: email.trim(), display_name: displayName.trim(), password, otp_code: otpCode })
      navigate('/quet', { replace: true })
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && ['INVALID_OTP', 'OTP_EXPIRED', 'OTP_MAX_ATTEMPTS'].includes(apiError.errorCode)) {
        setOtpError(apiError.message)
        if (apiError.errorCode === 'OTP_EXPIRED' || apiError.errorCode === 'OTP_MAX_ATTEMPTS') setExpiresAt(Date.now())
      } else {
        const mapped = registerApiFieldErrors(apiError)
        setFieldErrors(mapped)
        if (Object.values(mapped).some(Boolean)) setStep('details')
        else setError(apiError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (step === 'details') {
      if (sentEmail === email.trim().toLowerCase() && expiresAt > Date.now()) {
        const errors = validateRegister({ username, email, display_name: displayName, password, confirmation })
        setFieldErrors(errors)
        if (!Object.values(errors).some(Boolean)) {
          setNow(Date.now())
          setStep('otp')
        }
      } else void sendCode()
    }
    else void verifyCode()
  }

  async function registerWithGoogle(idToken: string) {
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
      <h1 className="text-title font-semibold">Đăng ký</h1>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {step === 'details' ? <>
          <Field id="register-username" label="Tên đăng nhập" autoComplete="username" required value={username} error={fieldErrors.username} onChange={(event) => { setUsername(event.target.value); clearFieldError('username') }} />
          <Field id="register-email" label="Email" type="email" autoComplete="email" required value={email} error={fieldErrors.email} onChange={(event) => { setEmail(event.target.value); clearFieldError('email') }} />
          <Field id="register-display-name" label="Tên hiển thị" autoComplete="name" required value={displayName} error={fieldErrors.display_name} onChange={(event) => { setDisplayName(event.target.value); clearFieldError('display_name') }} />
          <Field id="register-password" label="Mật khẩu" type="password" autoComplete="new-password" required value={password} error={fieldErrors.password} onChange={(event) => { setPassword(event.target.value); clearFieldError('password') }} />
          <Field id="register-confirmation" label="Nhập lại mật khẩu" type="password" autoComplete="new-password" required value={confirmation} error={fieldErrors.confirmation} onChange={(event) => { setConfirmation(event.target.value); clearFieldError('confirmation') }} />
        </> : <>
          <p className="text-small text-muted">Mã đã gửi tới {email}. Còn {clock(remaining)}.</p>
          <Field id="register-otp" label="Mã 6 chữ số" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otpCode} error={otpError} onChange={(event) => { setOtpCode(event.target.value.replace(/\D/g, '')); setOtpError('') }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={loading || resendRemaining > 0} onClick={() => void sendCode()}>{resendRemaining > 0 ? `Gửi lại sau ${clock(resendRemaining)}` : 'Gửi lại mã'}</Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => { setStep('details'); setOtpCode(''); setOtpError(''); setNotice(''); setError('') }}>Sửa thông tin</Button>
          </div>
        </>}
        {notice && <FormNotice tone="success" message={notice} />}
        {error && <FormNotice message={error} />}
        <Button type="submit" loading={loading} disabled={loading || (step === 'otp' && remaining === 0)}>{step === 'details' ? 'Gửi mã xác nhận' : 'Kiểm tra mã và đăng ký'}</Button>
      </form>
      {import.meta.env.VITE_GOOGLE_CLIENT_ID && <div className="grid gap-4 border-t border-line pt-5">
        <p className="text-small text-muted">Hoặc đăng ký bằng Google</p>
        <GoogleSignInButton onCredential={(token) => void registerWithGoogle(token)} busy={loading || googleLoading} text="signup_with" />
      </div>}
      <p className="text-small text-muted">Đã có tài khoản? <AuthLink to="/login">Đăng nhập</AuthLink></p>
    </div>
  )
}
