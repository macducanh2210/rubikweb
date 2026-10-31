import { NavLink, Outlet } from 'react-router-dom'
import { LogoutButton } from '../components/LogoutButton'

const accountLinks = [
  { to: '/tai-khoan', label: 'Hồ sơ', end: true },
  { to: '/tai-khoan/cai-dat', label: 'Cài đặt', end: false },
]

export function AccountPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-title font-semibold">Tài khoản</h1>
      <nav aria-label="Hồ sơ và cài đặt" className="flex gap-6 border-b border-line">
        {accountLinks.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-h-11 items-center border-b-2 text-body font-medium ${isActive ? 'border-link text-link' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
      <div className="border-t border-line pt-6">
        <LogoutButton />
      </div>
    </div>
  )
}
