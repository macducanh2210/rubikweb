import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ConfirmDialog, EmptyState, Field, FileField, FormNotice, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { AuthLink } from '../components/AuthLink'
import { formatDate } from '../lib/formatDate'
import { getApiError } from '../services/api'
import { authService } from '../services/authService'
import { userService } from '../services/userService'
import type { UserProfile } from '../types'

const maxAvatarBytes = 2 * 1024 * 1024
const avatarTypes = new Set(['image/jpeg', 'image/png'])

export function ProfilePage() {
  const { updateUser, clearSession } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<'profile' | 'password' | 'delete' | 'google' | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [nameError, setNameError] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [oldPasswordError, setOldPasswordError] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordNotice, setPasswordNotice] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [googleNotice, setGoogleNotice] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let active = true
    userService.getCurrentUser().then((next) => {
      if (!active) return
      setProfile(next)
      setDisplayName(next.display_name)
      updateUser(next)
      setLoadError('')
    }).catch((cause: unknown) => {
      if (active) setLoadError(getApiError(cause).message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadKey, updateUser])

  function chooseAvatar(file: File | undefined) {
    setAvatarError('')
    setAvatarFile(null)
    if (!file) return
    if (!avatarTypes.has(file.type)) {
      setAvatarError('Chọn ảnh JPG hoặc PNG.')
    } else if (file.size > maxAvatarBytes) {
      setAvatarError('Ảnh không được vượt quá 2 MB.')
    } else setAvatarFile(file)
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || busy) return
    const name = displayName.trim()
    setNameError('')
    setProfileError('')
    setProfileNotice('')
    if (!name || name.length > 50) {
      setNameError(name ? 'Tên hiển thị tối đa 50 ký tự.' : 'Nhập tên hiển thị.')
      return
    }
    if (avatarError || (name === profile.display_name && !avatarFile)) return
    setBusy('profile')
    try {
      const next = await userService.updateCurrentUser({
        ...(name !== profile.display_name ? { display_name: name } : {}),
        ...(avatarFile ? { avatar: avatarFile } : {}),
      })
      setProfile(next)
      updateUser(next)
      setDisplayName(next.display_name)
      setAvatarFile(null)
      setProfileNotice('Đã lưu thay đổi')
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && (apiError.errorCode === 'INVALID_FILE_TYPE' || apiError.errorCode === 'FILE_TOO_LARGE')) setAvatarError(apiError.message)
      else if (apiError.kind === 'api' && apiError.errorCode === 'VALIDATION_ERROR') {
        const fields = apiError.details?.fields
        const message = typeof fields === 'object' && fields !== null && !Array.isArray(fields) ? (fields as Record<string, unknown>).display_name : undefined
        if (typeof message === 'string') setNameError(message)
        else setProfileError(apiError.message)
      } else setProfileError(apiError.message)
    } finally { setBusy(null) }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setOldPasswordError('')
    setNewPasswordError('')
    setConfirmationError('')
    setPasswordError('')
    setPasswordNotice('')
    if (!oldPassword) { setOldPasswordError('Nhập mật khẩu cũ.'); return }
    if (newPassword.length < 8) { setNewPasswordError('Mật khẩu mới cần ít nhất 8 ký tự.'); return }
    if (newPassword !== confirmation) { setConfirmationError('Mật khẩu nhập lại chưa khớp.'); return }
    setBusy('password')
    try {
      const data = await userService.changePassword({ old_password: oldPassword, new_password: newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmation('')
      setPasswordNotice(data.message)
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'WRONG_OLD_PASSWORD') setOldPasswordError(apiError.message)
      else if (apiError.kind === 'api' && apiError.errorCode === 'WEAK_PASSWORD') setNewPasswordError(apiError.message)
      else setPasswordError(apiError.message)
    } finally { setBusy(null) }
  }

  async function deleteAccount() {
    if (busy) return
    if (!deletePassword) { setDeleteError('Nhập mật khẩu để xóa tài khoản.'); return }
    setBusy('delete')
    setDeleteError('')
    try {
      await userService.deleteCurrentUser({ password: deletePassword })
      clearSession()
      navigate('/login', { replace: true })
    } catch (cause) {
      const apiError = getApiError(cause)
      setDeleteError(apiError.message)
    } finally { setBusy(null) }
  }

  async function linkGoogle(idToken: string) {
    if (busy || !profile || profile.google_linked) return
    setBusy('google')
    setGoogleError('')
    setGoogleNotice('')
    try {
      const data = await authService.linkGoogle({ id_token: idToken })
      setProfile((current) => current ? { ...current, google_linked: true } : current)
      setGoogleNotice(data.message)
    } catch (cause) {
      setGoogleError(getApiError(cause).message)
    } finally { setBusy(null) }
  }

  if (loading) return <div role="status" className="flex items-center gap-3"><Spinner />Đang tải hồ sơ…</div>
  if (!profile) return (
    <div className="grid gap-4">
      {loadError && <FormNotice message={loadError} />}
      <EmptyState title="Chưa tải được hồ sơ" description="Thử kết nối lại để xem thông tin tài khoản." action={<Button variant="secondary" onClick={() => { setLoading(true); setLoadKey((value) => value + 1) }}>Thử lại</Button>} />
    </div>
  )

  return (
    <div className="grid gap-8">
      <section aria-label="Thông tin hồ sơ" className="grid gap-4">
        <div className="flex items-center gap-4">
          {profile.avatar
            ? <img src={profile.avatar} alt={`Ảnh đại diện của ${profile.display_name}`} className="size-24 rounded-control border border-control-border object-cover" />
            : <div className="grid size-24 place-items-center rounded-control border border-control-border bg-quiet text-small text-muted">Chưa có ảnh</div>}
          <div className="grid gap-1 text-small">
            <p className="font-semibold text-ink">{profile.display_name}</p>
            <p className="text-muted">@{profile.username}</p>
          </div>
        </div>
        <dl className="grid gap-3 border-t border-line pt-4 text-small sm:grid-cols-2">
          <div><dt className="text-muted">Tên đăng nhập</dt><dd>{profile.username}</dd></div>
          <div><dt className="text-muted">Email</dt><dd className="break-all">{profile.email}</dd></div>
          <div><dt className="text-muted">Ngày tạo</dt><dd>{formatDate(profile.created_at)}</dd></div>
        </dl>
      </section>

      <section className="grid gap-4 border-t border-line pt-6">
        <h2 className="text-section font-semibold">Sửa hồ sơ</h2>
        <form onSubmit={(event) => void saveProfile(event)} noValidate className="grid gap-4">
          <Field id="profile-name" label="Tên hiển thị" value={displayName} error={nameError} onChange={(event) => { setDisplayName(event.target.value); setNameError('') }} />
          <FileField id="profile-avatar" label="Ảnh đại diện" accept="image/jpeg,image/png" file={avatarFile} onChange={chooseAvatar} hint="JPG hoặc PNG, tối đa 2 MB." error={avatarError} />
          {profileError && <FormNotice message={profileError} />}
          {profileNotice && <FormNotice tone="success" message={profileNotice} />}
          <Button type="submit" loading={busy === 'profile'} disabled={busy !== null || (displayName.trim() === profile.display_name && !avatarFile)} className="justify-self-start">Lưu thay đổi</Button>
        </form>
      </section>

      <section className="grid gap-4 border-t border-line pt-6">
        <h2 className="text-section font-semibold">Tài khoản Google</h2>
        {profile.google_linked
          ? <p className="text-small text-muted">Đã liên kết. Bạn có thể đăng nhập bằng Google.</p>
          : <>
            <p className="text-small text-muted">Dùng cùng địa chỉ email {profile.email} để liên kết và đăng nhập bằng Google.</p>
            <GoogleSignInButton onCredential={(token) => void linkGoogle(token)} busy={busy !== null} />
          </>}
        {googleError && <FormNotice message={googleError} />}
        {googleNotice && <FormNotice tone="success" message={googleNotice} />}
      </section>

      <section className="grid gap-4 border-t border-line pt-6">
        <h2 className="text-section font-semibold">Đổi mật khẩu</h2>
        {!profile.has_password ? <p className="text-small text-muted">Tài khoản này chưa có mật khẩu. Dùng <AuthLink to="/forgot-password">Quên mật khẩu</AuthLink> để tạo mật khẩu trước khi đổi hoặc xóa tài khoản.</p> : <form onSubmit={(event) => void changePassword(event)} noValidate className="grid gap-4">
          <Field id="old-password" label="Mật khẩu cũ" type="password" autoComplete="current-password" value={oldPassword} error={oldPasswordError} onChange={(event) => { setOldPassword(event.target.value); setOldPasswordError('') }} />
          <Field id="new-password" label="Mật khẩu mới" type="password" autoComplete="new-password" value={newPassword} error={newPasswordError} onChange={(event) => { setNewPassword(event.target.value); setNewPasswordError('') }} />
          <Field id="confirm-password" label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" value={confirmation} error={confirmationError} onChange={(event) => { setConfirmation(event.target.value); setConfirmationError('') }} />
          {passwordError && <FormNotice message={passwordError} />}
          {passwordNotice && <FormNotice tone="success" message={passwordNotice} />}
          <Button type="submit" loading={busy === 'password'} disabled={busy !== null} className="justify-self-start">Đổi mật khẩu</Button>
        </form>}
      </section>

      <section className="grid gap-4 border-t border-line pt-6">
        <h2 className="text-section font-semibold">Xóa tài khoản</h2>
        <p className="text-small text-muted">Thao tác này sẽ chấm dứt quyền đăng nhập của tài khoản.</p>
        <Button variant="danger" disabled={!profile.has_password} className="justify-self-start" onClick={() => { setDeletePassword(''); setDeleteError(''); setDeleteOpen(true) }}>Xóa tài khoản</Button>
      </section>

      {deleteOpen && (
        <ConfirmDialog title="Xóa tài khoản" description="Tài khoản sẽ bị đánh dấu đã xóa, các phiên hiện tại bị thu hồi và bạn sẽ không thể đăng nhập lại. Nhập mật khẩu để tiếp tục." confirmLabel="Xóa tài khoản" danger busy={busy === 'delete'} onClose={() => setDeleteOpen(false)} onConfirm={() => void deleteAccount()}>
          <Field id="delete-password" label="Mật khẩu xác nhận" type="password" autoComplete="current-password" value={deletePassword} error={deleteError} onChange={(event) => { setDeletePassword(event.target.value); setDeleteError('') }} />
        </ConfirmDialog>
      )}
    </div>
  )
}
