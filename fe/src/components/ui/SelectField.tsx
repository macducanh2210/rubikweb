import type { SelectHTMLAttributes } from 'react'

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id: string
  label: string
  options: readonly { value: string; label: string }[]
  error?: string
}

export function SelectField({ id, label, options, error, ...props }: SelectFieldProps) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-small font-medium text-ink">{label}</label>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full rounded-control border border-control-border bg-surface px-3 py-2 text-body text-ink" {...props}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error && <p id={`${id}-error`} role="alert" className="text-small text-danger-text">{error}</p>}
    </div>
  )
}
