import { useEffect, useState } from 'react'
import { Button, ConfirmDialog, EmptyState, Field, FormNotice, Spinner, StatusBadge, ToggleField } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/formatDate'
import { adminService } from '../services/adminService'
import { getApiError } from '../services/api'
import type { AdminUser, ListUsersData, UserStatus } from '../types'

type AdminAction = 'lock' | 'unlock' | 'delete'
interface PendingAction { user: AdminUser; action: AdminAction }

const statusLabels: Record<UserStatus, string> = {
  active: 'Đang hoạt động',
  locked: 'Đã khóa',
  deleted: 'Đã xóa',
}
const actionLabels: Record<AdminAction, string> = {
  lock: 'Khóa tài khoản',
  unlock: 'Mở khóa tài khoản',
  delete: 'Xóa tài khoản',
}

export function AdminPage() {
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<ListUsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setDebouncedSearch(search)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true)
    adminService.listUsers({ page, limit: 20, search: debouncedSearch, include_deleted: includeDeleted }).then((next) => {
      if (!active) return
      setData(next)
      setError('')
    }).catch((cause: unknown) => {
      if (active) {
        setData(null)
        setError(getApiError(cause).message)
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, debouncedSearch, includeDeleted, reloadKey])

  function openAction(target: AdminUser, action: AdminAction) {
    setNotice('')
    setActionError('')
    setPending({ user: target, action })
  }

  async function runAction() {
    if (!pending || actionBusy) return
    const { user, action } = pending
    setActionBusy(true)
    setActionError('')
    try {
      if (action === 'delete') {
        await adminService.deleteUser(user.id)
        setData((current) => {
          if (!current) return current
          return includeDeleted
            ? { ...current, items: current.items.map((item) => item.id === user.id ? { ...item, status: 'deleted' } : item) }
            : { ...current, items: current.items.filter((item) => item.id !== user.id), total: Math.max(0, current.total - 1) }
        })
        if (!includeDeleted && data?.items.length === 1 && page > 1) setPage(page - 1)
      } else {
        const result = action === 'lock' ? await adminService.lockUser(user.id) : await adminService.unlockUser(user.id)
        setData((current) => current ? {
          ...current,
          items: current.items.map((item) => item.id === result.id ? { ...item, status: result.status } : item),
        } : current)
      }
      setNotice(`Đã ${action === 'lock' ? 'khóa' : action === 'unlock' ? 'mở khóa' : 'xóa'} tài khoản ${user.username}`)
      setPending(null)
    } catch (cause) {
      const apiError = getApiError(cause)
      setActionError(apiError.message)
    } finally { setActionBusy(false) }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1

  function userActions(item: AdminUser) {
    if (item.status === 'deleted') return null
    const protectedUser = item.id === currentUser?.id || item.role === 'admin'
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={protectedUser || actionBusy} onClick={() => openAction(item, item.status === 'locked' ? 'unlock' : 'lock')}>{item.status === 'locked' ? 'Mở khóa' : 'Khóa'}</Button>
        <Button variant="danger" disabled={protectedUser || actionBusy} onClick={() => openAction(item, 'delete')}>Xóa</Button>
      </div>
    )
  }

  function userStatus(item: AdminUser) {
    return <StatusBadge label={statusLabels[item.status]} tone={item.status === 'active' ? 'success' : item.status === 'locked' ? 'warning' : 'danger'} />
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-title font-semibold">Quản trị người dùng</h1>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field id="admin-search" label="Tìm người dùng" type="search" value={search} onChange={(event) => setSearch(event.target.value)} hint="Tìm theo tên đăng nhập, email hoặc tên hiển thị." />
        <ToggleField id="admin-include-deleted" label="Hiện tài khoản đã xóa" checked={includeDeleted} onChange={(event) => { setIncludeDeleted(event.target.checked); setPage(1) }} />
      </div>
      {notice && <FormNotice tone="success" message={notice} />}
      {error && <FormNotice message={error} />}
      {loading && <div role="status" className="flex items-center gap-3"><Spinner />Đang tải danh sách…</div>}
      {!loading && !data && (
        <EmptyState title="Chưa tải được danh sách" description="Thử kết nối lại để xem người dùng." action={<Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</Button>} />
      )}
      {!loading && data?.items.length === 0 && (
        <EmptyState title="Không có người dùng phù hợp" description="Đổi từ khóa tìm kiếm hoặc bộ lọc để xem thêm." />
      )}
      {!loading && data && data.items.length > 0 && (
        <ul aria-label="Danh sách người dùng" className="divide-y divide-line border-y border-line md:hidden">
          {data.items.map((item) => (
            <li key={item.id} className="grid gap-2 py-4 text-small">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{item.username}</span>
                {userStatus(item)}
              </div>
              <span className="text-ink">{item.display_name}</span>
              <span className="break-all text-muted">{item.email}</span>
              <div className="flex flex-wrap gap-x-4 text-muted">
                <span>{item.role === 'admin' ? 'Quản trị' : 'Người dùng'}</span>
                <span>Tạo ngày {formatDate(item.created_at)}</span>
              </div>
              {userActions(item)}
            </li>
          ))}
        </ul>
      )}
      {!loading && data && data.items.length > 0 && (
        <div className="hidden max-w-full overflow-x-auto border-y border-line md:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-small">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="px-2 py-3 font-medium">Tên đăng nhập</th>
                <th scope="col" className="px-2 py-3 font-medium">Email</th>
                <th scope="col" className="px-2 py-3 font-medium">Tên hiển thị</th>
                <th scope="col" className="px-2 py-3 font-medium">Vai trò</th>
                <th scope="col" className="px-2 py-3 font-medium">Trạng thái</th>
                <th scope="col" className="px-2 py-3 font-medium">Ngày tạo</th>
                <th scope="col" className="px-2 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-line align-middle">
                    <td className="px-2 py-3 font-medium">{item.username}</td>
                    <td className="px-2 py-3">{item.email}</td>
                    <td className="px-2 py-3">{item.display_name}</td>
                    <td className="px-2 py-3">{item.role === 'admin' ? 'Quản trị' : 'Người dùng'}</td>
                    <td className="px-2 py-3">{userStatus(item)}</td>
                    <td className="px-2 py-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                    <td className="px-2 py-3">{userActions(item)}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-small text-muted">
          <span>Trang {page} / {totalPages}. Tổng {data.total} người dùng.</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trang trước</Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Trang sau</Button>
          </div>
        </div>
      )}
      {pending && (
        <ConfirmDialog
          title={actionLabels[pending.action]}
          description={`${pending.action === 'delete' ? 'Tài khoản sẽ bị đánh dấu đã xóa và không thể đăng nhập.' : pending.action === 'lock' ? 'Người dùng sẽ không thể đăng nhập cho đến khi được mở khóa.' : 'Người dùng có thể đăng nhập lại.'} Tài khoản: ${pending.user.username}.`}
          confirmLabel={actionLabels[pending.action]}
          danger={pending.action !== 'unlock'}
          busy={actionBusy}
          onClose={() => setPending(null)}
          onConfirm={() => void runAction()}
        >
          {actionError && <FormNotice message={actionError} />}
        </ConfirmDialog>
      )}
    </div>
  )
}
