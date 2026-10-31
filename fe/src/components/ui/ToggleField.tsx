import type { ChangeEventHandler } from 'react'

export interface ToggleFieldProps {
  id: string
  label: string
  checked: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
  disabled?: boolean
  error?: string
}

export function ToggleField({ id, label, checked, onChange, disabled, error }: ToggleFieldProps) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="size-5 shrink-0 accent-action" />
        {label}
      </label>
      {error && <p id={`${id}-error`} role="alert" className="text-small text-danger-text">{error}</p>}
    </div>
  )
}
