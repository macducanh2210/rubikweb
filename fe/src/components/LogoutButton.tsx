import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, ConfirmDialog } from './ui'

export function LogoutButton({ variant = 'secondary', iconOnly = false, navigation = false, className = '' }: {
  variant?: 'secondary' | 'ghost'
  iconOnly?: boolean
  navigation?: boolean
  className?: string
}) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <Button
        variant={variant}
        className={className}
        style={navigation ? {
          font: 'inherit',
          padding: '0 var(--space-3)',
          borderWidth: '0 0 0 2px',
        } : undefined}
        disabled={signingOut}
        title={iconOnly ? 'Đăng xuất' : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <LogOut size={20} strokeWidth={1.75} aria-hidden="true" className={`shrink-0 ${navigation ? 'order-last ml-auto' : ''}`} />
        <span className={iconOnly ? 'sr-only' : undefined}>Đăng xuất</span>
      </Button>
      {open && (
        <ConfirmDialog
          title="Đăng xuất"
          description="Bạn muốn đăng xuất khỏi CubeMate?"
          confirmLabel="Đăng xuất"
          busy={signingOut}
          onClose={() => setOpen(false)}
          onConfirm={() => void signOut()}
        />
      )}
    </>
  )
}
