export interface StatusBadgeProps {
  label: string
  tone: 'success' | 'warning' | 'danger'
}

const dotColors = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger-text',
} as const

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 text-small text-ink">
      <span aria-hidden="true" className={`size-2 rounded-full ${dotColors[tone]}`} />
      {label}
    </span>
  )
}
