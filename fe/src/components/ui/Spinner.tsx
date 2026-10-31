export interface SpinnerProps {
  label?: string
  size?: 'small' | 'regular'
}

export function Spinner({ label = 'Đang tải', size = 'regular' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center">
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${size === 'small' ? 'size-4' : 'size-6'}`}
      />
    </span>
  )
}
