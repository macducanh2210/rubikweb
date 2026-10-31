import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  loading?: boolean
  children: ReactNode
}

const variants = {
  primary: 'border-action bg-action text-on-action',
  secondary: 'border-control-border bg-surface text-ink',
  danger: 'border-danger bg-danger text-on-danger',
  ghost: 'border-transparent bg-transparent text-muted hover:text-ink',
} as const

export function Button({
  variant = 'primary', loading = false, disabled, className = '', children, type = 'button', ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2 text-body font-semibold leading-normal transition-colors disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner label="Đang xử lý" size="small" />}
      {children}
    </button>
  )
}
