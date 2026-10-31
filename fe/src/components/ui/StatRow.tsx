export interface StatRowProps {
  label: string
  value: string | number
  unit?: string
  size?: 'normal' | 'large' | 'compact'
}

export function StatRow({ label, value, unit, size = 'normal' }: StatRowProps) {
  return (
    <div className={`flex min-w-0 border-b border-line py-3 ${size === 'normal' ? 'items-baseline justify-between gap-4' : 'flex-col items-start gap-1'}`}>
      <span className="text-small text-muted">{label}</span>
      <span className={`font-mono font-semibold text-ink ${size === 'large' ? 'text-display' : size === 'compact' ? 'text-title' : 'text-section'}`}>
        {value}{unit && <span className="ml-1 font-sans text-small font-normal text-muted">{unit}</span>}
      </span>
    </div>
  )
}
