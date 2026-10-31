import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, ConfirmDialog, EmptyState, FormNotice, SelectField, Spinner, ToggleField } from '../components/ui'
import { previewTheme, setTheme } from '../lib/theme'
import { getApiError } from '../services/api'
import { settingsService } from '../services/settingsService'
import type { AnimationSpeed, CameraResolution, Settings, Theme, UpdateSettingsRequest } from '../types'

const themeOptions = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
]
const speedOptions = [
  { value: 'slow', label: 'Chậm' },
  { value: 'normal', label: 'Bình thường' },
  { value: 'fast', label: 'Nhanh' },
]
const resolutionOptions = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

function changedSettings(saved: Settings, draft: Settings): UpdateSettingsRequest {
  const patch: UpdateSettingsRequest = {}
  if (draft.theme !== saved.theme) patch.theme = draft.theme
  if (draft.animation_speed !== saved.animation_speed) patch.animation_speed = draft.animation_speed
  const camera: UpdateSettingsRequest['camera_config'] = {}
  if (draft.camera_config.resolution !== saved.camera_config.resolution) camera.resolution = draft.camera_config.resolution
  if (draft.camera_config.auto_focus !== saved.camera_config.auto_focus) camera.auto_focus = draft.camera_config.auto_focus
  if (Object.keys(camera).length) patch.camera_config = camera
  return patch
}

export function SettingsPage() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const savedRef = useRef<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    let active = true
    settingsService.getSettings().then((settings) => {
      if (!active) return
      setSaved(settings)
      savedRef.current = settings
      setDraft(settings)
      setTheme(settings.theme)
      setError('')
    }).catch((cause: unknown) => {
      if (active) setError(getApiError(cause).message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadKey])

  useEffect(() => () => {
    if (savedRef.current) previewTheme(savedRef.current.theme)
  }, [])

  function updateDraft(next: Settings, field: string) {
    setDraft(next)
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setNotice('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!saved || !draft || busy) return
    const patch = changedSettings(saved, draft)
    if (!Object.keys(patch).length) return
    setBusy('save')
    setError('')
    setNotice('')
    setFieldErrors({})
    try {
      const settings = await settingsService.updateSettings(patch)
      setSaved(settings)
      savedRef.current = settings
      setDraft(settings)
      setTheme(settings.theme)
      setNotice('Đã lưu cài đặt')
    } catch (cause) {
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'INVALID_SETTING_VALUE') {
        const field = apiError.details?.field
        if (typeof field === 'string' && ['theme', 'animation_speed', 'camera_config.resolution', 'camera_config.auto_focus', 'resolution', 'auto_focus'].includes(field)) {
          setFieldErrors({ [field]: apiError.message })
        } else setError(apiError.message)
      } else setError(apiError.message)
    } finally { setBusy(null) }
  }

  async function reset() {
    if (busy) return
    setBusy('reset')
    setError('')
    try {
      const settings = await settingsService.resetSettings()
      setSaved(settings)
      savedRef.current = settings
      setDraft(settings)
      setTheme(settings.theme)
      setFieldErrors({})
      setResetOpen(false)
      setNotice('Đã khôi phục cài đặt mặc định')
    } catch (cause) { setError(getApiError(cause).message) }
    finally { setBusy(null) }
  }

  if (loading) return <div role="status" className="flex items-center gap-3"><Spinner />Đang tải cài đặt…</div>
  if (!saved || !draft) return (
    <div className="grid gap-4">
      {error && <FormNotice message={error} />}
      <EmptyState title="Chưa tải được cài đặt" description="Thử kết nối lại để xem cài đặt của bạn." action={<Button variant="secondary" onClick={() => { setLoading(true); setLoadKey((value) => value + 1) }}>Thử lại</Button>} />
    </div>
  )

  const hasChanges = Object.keys(changedSettings(saved, draft)).length > 0
  return (
    <div className="grid gap-8">
      <form onSubmit={(event) => void save(event)} className="grid gap-6">
        <section className="grid gap-4">
          <h2 className="text-section font-semibold">Giao diện và hướng dẫn giải</h2>
          <SelectField id="settings-theme" label="Giao diện" options={themeOptions} value={draft.theme} error={fieldErrors.theme} onChange={(event) => { const theme = event.target.value as Theme; previewTheme(theme); updateDraft({ ...draft, theme }, 'theme') }} />
          <SelectField id="settings-speed" label="Tốc độ hoạt ảnh" options={speedOptions} value={draft.animation_speed} error={fieldErrors.animation_speed} onChange={(event) => updateDraft({ ...draft, animation_speed: event.target.value as AnimationSpeed }, 'animation_speed')} />
          <div className="grid gap-1 text-small"><span className="text-muted">Thuật toán giải</span><span className="text-ink">Kociemba</span></div>
        </section>
        <section className="grid gap-4 border-t border-line pt-6">
          <h2 className="text-section font-semibold">Camera</h2>
          <SelectField id="settings-resolution" label="Độ phân giải" options={resolutionOptions} value={draft.camera_config.resolution} error={fieldErrors['camera_config.resolution'] || fieldErrors.resolution} onChange={(event) => updateDraft({ ...draft, camera_config: { ...draft.camera_config, resolution: event.target.value as CameraResolution } }, 'camera_config.resolution')} />
          <ToggleField id="settings-focus" label="Tự lấy nét" checked={draft.camera_config.auto_focus} error={fieldErrors['camera_config.auto_focus'] || fieldErrors.auto_focus} onChange={(event) => updateDraft({ ...draft, camera_config: { ...draft.camera_config, auto_focus: event.target.checked } }, 'camera_config.auto_focus')} />
        </section>
        {error && <FormNotice message={error} />}
        {notice && <FormNotice tone="success" message={notice} />}
        <Button type="submit" className="justify-self-start" loading={busy === 'save'} disabled={busy !== null || !hasChanges}>Lưu cài đặt</Button>
      </form>
      <section className="grid gap-4 border-t border-line pt-6">
        <h2 className="text-section font-semibold">Cài đặt mặc định</h2>
        <p className="text-small text-muted">Khôi phục giao diện, tốc độ hoạt ảnh và camera về giá trị ban đầu.</p>
        <Button variant="secondary" className="justify-self-start" disabled={busy !== null} onClick={() => { setError(''); setResetOpen(true) }}>Khôi phục mặc định</Button>
      </section>
      {resetOpen && <ConfirmDialog title="Khôi phục cài đặt mặc định" description="Giao diện, tốc độ hoạt ảnh và camera sẽ trở về giá trị ban đầu." confirmLabel="Khôi phục mặc định" busy={busy === 'reset'} onClose={() => setResetOpen(false)} onConfirm={() => void reset()}>{error && <FormNotice message={error} />}</ConfirmDialog>}
    </div>
  )
}
