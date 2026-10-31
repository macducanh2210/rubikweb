export interface MoveChipProps {
  move: string
  step: number
  active?: boolean
  completed?: boolean
  onClick?: () => void
}

export function MoveChip({ move, step, active = false, completed = false, onClick }: MoveChipProps) {
  const classes = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-sticker border px-2 font-mono text-body font-semibold ${active
    ? 'border-on-bright bg-current-step text-on-bright'
    : `border-control-border bg-surface ${completed ? 'text-muted' : 'text-ink'}`}`

  return onClick ? (
    <button
      type="button"
      className={classes}
      aria-label={`Bước ${step}: ${move}`}
      aria-current={active ? 'step' : undefined}
      onClick={onClick}
    >{move}</button>
  ) : (
    <span className={classes} aria-label={`Bước ${step}: ${move}`}>{move}</span>
  )
}
