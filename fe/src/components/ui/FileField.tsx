import { useRef, type ChangeEventHandler } from 'react'
import { Button } from './Button'

export interface FileFieldProps {
  id: string
  label: string
  accept: string
  file: File | null
  onChange: (file: File | undefined) => void
  hint?: string
  error?: string
}

export function FileField({ id, label, accept, file, onChange, hint, error }: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange(event.target.files?.[0])
    event.target.value = ''
  }
  return (
    <div className="grid gap-2">
      <span id={`${id}-label`} className="text-small font-medium text-ink">{label}</span>
      <input ref={inputRef} id={id} type="file" accept={accept} className="hidden" tabIndex={-1} aria-hidden="true" onChange={handleChange} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" aria-describedby={`${id}-label`} onClick={() => inputRef.current?.click()}>Chọn ảnh đại diện</Button>
        <span className="text-small text-muted break-all">{file?.name ?? 'Chưa chọn ảnh'}</span>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-small text-danger-text">{error}</p>}
      {!error && hint && <p className="text-small text-muted">{hint}</p>}
    </div>
  )
}
