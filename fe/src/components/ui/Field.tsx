import type { InputHTMLAttributes } from 'react'

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  label: string
  error?: string
  hint?: string
}

export function Field({ id, label, error, hint, className = '', ...props }: FieldProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-small font-medium text-ink">{label}</label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        className={`min-h-11 w-full rounded-control border border-control-border bg-surface px-3 py-2 text-body text-ink placeholder:text-muted ${className}`}
        {...props}
      />
      {error && <p id={`${id}-error`} role="alert" className="text-small text-danger-text">{error}</p>}
      {!error && hint && <p id={`${id}-hint`} className="text-small text-muted">{hint}</p>}
    </div>
  )
}
