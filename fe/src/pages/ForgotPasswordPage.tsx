import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, FormNotice } from '../components/ui'
import { AuthLink } from '../components/AuthLink'
import { validateEmail, validatePassword } from '../lib/authValidation'
import { getApiError } from '../services/api'
import { authService } from '../services/authService'
import { useAuth } from '../context/AuthContext'

type Step = 'email' | 'otp' | 'password'

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(user?.email ?? '')
  const [otpCode, setOtpCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (step !== 'otp') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const resendRemaining = Math.max(0, Math.ceil((resendAt - now) / 1000))

  function clearMessages() {
    setError('')
    setFieldError('')
    setNewPasswordError('')
    setConfirmationError('')
    setNotice('')
  }

  function returnToEmail(message: string) {
    setStep('email')
    setOtpCode('')
    setResetToken('')
    setExpiresAt(0)
    setResendAt(0)
    setError(message)
  }

  async function sendCode(resend = false) {
    const validation = validateEmail(email)
    if (validation) {
      setFieldError(validation)
      return
    }
    setLoading(true)
    setResending(resend)
    clearMessages()
    try {
      const data = await authService.forgotPassword({ email: email.trim() })
      const sentAt = Date.now()
      setNow(sentAt)
      setExpiresAt(sentAt + data.expires_in * 1000)
      setResendAt(sentAt + 60_000)
      setOtpCode('')
      setNotice(data.message)
      setStep('otp')
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'EMAIL_NOT_FOUND') setFieldError(apiError.message)
      else setError(apiError.message)
    } finally {
      setLoading(false)
      setResending(false)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(otpCode)) {
      setFieldError('Nhập mã gồm đúng 6 chữ số.')
      return
    }
    if (remaining === 0) {
      setFieldError('Mã đã hết hạn. Hãy gửi lại mã.')
      return
    }
    setLoading(true)
    clearMessages()
    try {
      const data = await authService.verifyOtp({ email: email.trim(), otp_code: otpCode })
      setResetToken(data.reset_token)
      setStep('password')
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'OTP_MAX_ATTEMPTS') {
        returnToEmail(`${apiError.message} Hãy gửi mã mới.`)
      } else if (apiError.kind === 'api' && (apiError.errorCode === 'INVALID_OTP' || apiError.errorCode === 'OTP_EXPIRED')) {
        setFieldError(apiError.message)
        if (apiError.errorCode === 'OTP_EXPIRED') setExpiresAt(Date.now())
      } else setError(apiError.message)
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword() {
    const validation = validatePassword(newPassword)
    if (validation) {
      setNewPasswordError(validation)
      return
    }
    if (newPassword !== confirmation) {
      setConfirmationError('Mật khẩu nhập lại chưa khớp.')
      return
    }
    setLoading(true)
    clearMessages()
    try {
      await authService.resetPassword({ reset_token: resetToken, new_password: newPassword })
      setResetToken('')
      clearSession()
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'INVALID_RESET_TOKEN') {
        returnToEmail(`${apiError.message} Hãy gửi mã mới.`)
      } else if (apiError.kind === 'api' && apiError.errorCode === 'WEAK_PASSWORD') setNewPasswordError(apiError.message)
      else setError(apiError.message)
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (step === 'email') void sendCode()
    else if (step === 'otp') void verifyCode()
    else void resetPassword()
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-title font-semibold">Quên mật khẩu</h1>
        <p className="mt-2 text-small text-muted">
          {step === 'email' ? 'Nhập email để nhận mã đặt lại mật khẩu.' : step === 'otp' ? 'Kiểm tra email và nhập mã xác thực.' : 'Tạo mật khẩu mới cho tài khoản.'}
        </p>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-5">
        {step === 'email' && (
          <Field id="reset-email" label="Email đã đăng ký" type="email" autoComplete="email" required value={email} error={fieldError} onChange={(event) => { setEmail(event.target.value); setFieldError('') }} />
        )}
        {step === 'otp' && (
          <>
            <p className="text-small text-muted">Mã đã gửi tới {email}. Còn {clock(remaining)}.</p>
            <Field id="reset-otp" label="Mã 6 chữ số" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otpCode} error={fieldError} onChange={(event) => { setOtpCode(event.target.value.replace(/\D/g, '')); setFieldError('') }} />
            {remaining === 0 && !fieldError && <FormNotice message="Mã đã hết hạn. Hãy gửi lại mã." />}
            <Button variant="secondary" loading={resending} disabled={loading || resendRemaining > 0} onClick={() => void sendCode(true)}>
              {resendRemaining > 0 ? `Gửi lại mã sau ${clock(resendRemaining)}` : 'Gửi lại mã'}
            </Button>
          </>
        )}
        {step === 'password' && (
          <>
            <Field id="reset-password" label="Mật khẩu mới" type="password" autoComplete="new-password" required value={newPassword} error={newPasswordError} onChange={(event) => { setNewPassword(event.target.value); setNewPasswordError('') }} />
            <Field id="reset-confirmation" label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" required value={confirmation} error={confirmationError} onChange={(event) => { setConfirmation(event.target.value); setConfirmationError('') }} />
          </>
        )}
        {notice && <FormNotice tone="success" message={notice} />}
        {error && <FormNotice message={error} />}
        <Button type="submit" loading={loading && !resending} disabled={loading || (step === 'otp' && remaining === 0)}>
          {step === 'email' ? 'Gửi mã xác thực' : step === 'otp' ? 'Kiểm tra mã' : 'Đặt lại mật khẩu'}
        </Button>
      </form>
      <AuthLink to={user ? '/tai-khoan' : '/login'} className="justify-self-start">{user ? 'Về hồ sơ' : 'Về đăng nhập'}</AuthLink>
    </div>
  )
}
