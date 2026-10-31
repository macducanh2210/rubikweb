import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, EmptyState, FormNotice, Spinner, StatRow, StatusBadge } from '../components/ui'
import { formatDateTime, formatDuration } from '../lib/formatDate'
import { getApiError } from '../services/api'
import { historyService } from '../services/historyService'
import type { ListHistoryData, StatisticsData } from '../types'

const PAGE_SIZE = 20
type HistoryTab = 'luot-giai' | 'thong-ke'
const StatisticsChart = lazy(() => import('../components/StatisticsChart'))

function readPage(value: string | null): number {
  const parsed = Number(value)
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function HistoryList({ data, page, onPageChange }: {
  data: ListHistoryData
  page: number
  onPageChange: (page: number) => void
}) {
  if (data.total === 0) {
    return <EmptyState title="Chưa có lượt giải nào. Quét một khối Rubik để bắt đầu." action={<Link className="text-link underline" to="/quet">Đến trang Quét</Link>} />
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  if (data.items.length === 0) {
    return <EmptyState title="Không có lượt giải ở trang này" description="Chọn trang đầu để xem các lượt giải hiện có." action={<Button variant="secondary" onClick={() => onPageChange(1)}>Về trang đầu</Button>} />
  }
  return (
    <div className="grid gap-6">
      <ul aria-label="Các lượt giải" className="divide-y divide-line border-y border-line">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link to={`/history/${item.id}`} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 text-small text-ink hover:bg-quiet sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] sm:px-2">
              <span className="font-medium">{formatDateTime(item.created_at)}</span>
              <span className="justify-self-end font-mono font-semibold sm:justify-self-start">{formatDuration(item.duration)}</span>
              <span className="text-muted">{item.total_steps} bước</span>
              <span className="justify-self-end sm:justify-self-start"><StatusBadge label={item.status === 'completed' ? 'Hoàn thành' : 'Bỏ dở'} tone={item.status === 'completed' ? 'success' : 'warning'} /></span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 text-small text-muted">
        <span>Trang {page} / {totalPages} · {data.total} lượt giải</span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Trang trước</Button>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Trang sau</Button>
        </div>
      </div>
    </div>
  )
}

function Statistics({ data }: { data: StatisticsData }) {
  if (data.total_solves === 0) {
    return <EmptyState title="Chưa có lượt giải hoàn thành" description="Hoàn thành một lượt giải để xem thống kê của bạn." action={<Link className="text-link underline" to="/quet">Đến trang Quét</Link>} />
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-x-8 sm:grid-cols-2">
        <StatRow label="Lượt đã hoàn thành" value={data.total_solves} size="large" />
        <StatRow label="Thời gian trung bình" value={data.average_time === null ? '—' : formatDuration(data.average_time)} size="large" />
        <StatRow label="Thời gian tốt nhất" value={data.best_time === null ? '—' : formatDuration(data.best_time)} size="large" />
        <StatRow label="Số bước trung bình" value={data.average_steps === null ? '—' : data.average_steps.toFixed(1)} size="large" />
      </div>
      <section aria-labelledby="progress-title" className="grid gap-3">
        <h2 id="progress-title" className="text-section font-semibold">Tiến bộ qua các lượt giải</h2>
        {data.progress.length < 2 ? (
          <p className="text-small text-muted">Cần ít nhất 2 lượt giải hoàn thành để vẽ biểu đồ.</p>
        ) : (
          <Suspense fallback={<div role="status" className="flex items-center gap-3"><Spinner />Đang tải biểu đồ…</div>}>
            <StatisticsChart progress={data.progress} />
          </Suspense>
        )}
        {data.progress.length >= 2 && <p className="text-caption text-muted">Trục ngang: thứ tự lượt giải · Trục dọc: thời gian (giây)</p>}
      </section>
    </div>
  )
}

export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: HistoryTab = searchParams.get('tab') === 'thong-ke' ? 'thong-ke' : 'luot-giai'
  const page = readPage(searchParams.get('page'))
  const [list, setList] = useState<ListHistoryData | null>(null)
  const [statistics, setStatistics] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const request = tab === 'luot-giai'
      ? historyService.list({ page, limit: PAGE_SIZE }).then((data) => { if (active) setList(data) })
      : historyService.getStatistics().then((data) => { if (active) setStatistics(data) })
    request.catch((cause: unknown) => {
      if (active) setError(getApiError(cause).message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tab, page, reloadKey])

  function selectTab(next: HistoryTab) {
    setSearchParams(next === 'thong-ke' ? { tab: 'thong-ke' } : {})
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-title font-semibold">Lịch sử</h1>
      <div role="tablist" aria-label="Nội dung lịch sử" className="flex gap-6 border-b border-line">
        {([['luot-giai', 'Lượt giải'], ['thong-ke', 'Thống kê']] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => selectTab(value)} className={`min-h-11 border-b-2 px-1 text-body font-semibold ${tab === value ? 'border-link text-link' : 'border-transparent text-muted'}`}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab === 'luot-giai' ? 'Lượt giải' : 'Thống kê'}>
        {loading && <div role="status" className="flex items-center gap-3"><Spinner />Đang tải {tab === 'luot-giai' ? 'lượt giải' : 'thống kê'}…</div>}
        {!loading && error && <div className="grid gap-3"><FormNotice message={error} /><Button variant="secondary" className="justify-self-start" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</Button></div>}
        {!loading && !error && tab === 'luot-giai' && list && <HistoryList data={list} page={page} onPageChange={(next) => setSearchParams({ page: String(next) })} />}
        {!loading && !error && tab === 'thong-ke' && statistics && <Statistics data={statistics} />}
      </div>
      <p className="text-small text-muted">Thống kê chỉ tính các lượt đã hoàn thành. Danh sách lượt giải gồm cả lượt bỏ dở.</p>
    </div>
  )
}
