import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      {description && <p className="text-body text-muted">{description}</p>}
      {action}
    </div>
  )
}
