import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogoMark } from './LogoMark'
import { LogoutButton } from './LogoutButton'

const navigation = [
  { to: '/quet', label: 'Quét' },
  { to: '/loi-giai', label: 'Lời giải' },
  { to: '/luyen-tap', label: 'Luyện tập' },
  { to: '/lich-su', label: 'Lịch sử' },
  { to: '/tai-khoan', label: 'Tài khoản' },
]

export function MainLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const items = user?.role === 'admin'
    ? [...navigation, { to: '/quan-tri', label: 'Quản trị' }]
    : navigation
  function relatedPage(to: string) {
    return (to === '/lich-su' && pathname.startsWith('/history/'))
      || (to === '/quet' && pathname === '/nhap-mau')
      || (to === '/luyen-tap' && (pathname === '/thu-thach' || pathname === '/thanh-tich'))
  }

  return (
    <div className="min-h-screen bg-page text-ink lg:grid lg:grid-cols-[208px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface px-4 py-7 lg:block">
        <div className="mb-10 flex items-center gap-3 px-2">
          <LogoMark />
          <span className="text-section font-semibold">CubeMate</span>
        </div>
        <nav aria-label="Điều hướng chính" className="grid gap-1">
          {items.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `flex min-h-11 items-center rounded-control border-l-2 px-3 text-small font-medium ${isActive || relatedPage(to)
                ? 'border-link bg-page text-link'
                : 'border-transparent text-muted hover:text-ink'}`}
            >
              {label}
            </NavLink>
          ))}
          <div className="text-small font-medium">
            <LogoutButton variant="ghost" navigation className="w-full justify-start" />
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex h-16 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <LogoMark />
          <span className="text-section font-semibold">CubeMate</span>
          <LogoutButton variant="ghost" iconOnly className="ml-auto size-11 p-0" />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `flex min-h-14 items-center justify-center border-t-2 px-1 text-center text-small font-medium ${isActive || relatedPage(to)
              ? 'border-link text-link'
              : 'border-transparent text-muted'}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
