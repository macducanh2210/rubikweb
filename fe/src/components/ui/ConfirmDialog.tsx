import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
  danger?: boolean
  children?: ReactNode
}

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose, busy = false, danger = false, children }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-panel border border-control-border bg-surface p-6 text-ink shadow-lg"
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <h2 id={titleId} className="text-section font-semibold">{title}</h2>
          <p className="text-body text-muted">{description}</p>
        </div>
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  )
}
