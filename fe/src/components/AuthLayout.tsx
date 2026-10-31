import { Outlet } from 'react-router-dom'
import { LogoMark } from './LogoMark'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-page text-ink md:grid md:grid-cols-2">
      <aside className="hidden min-h-screen flex-col items-center justify-center gap-6 md:flex">
        <LogoMark large />
        <span className="text-title font-semibold">CubeMate</span>
      </aside>
      <main className="flex min-h-screen flex-col bg-surface px-4 py-8 sm:px-8 md:justify-center md:px-12 lg:px-20">
        <div className="mb-12 flex flex-col items-start gap-2 md:hidden">
          <LogoMark />
          <span className="text-section font-semibold">CubeMate</span>
        </div>
        <div className="w-full max-w-md"><Outlet /></div>
      </main>
    </div>
  )
}
