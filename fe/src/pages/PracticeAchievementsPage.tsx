import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, FormNotice, Spinner, StatRow } from '../components/ui'
import { formatCentiseconds } from '../lib/cube/practice'
import { calculatePracticeAchievements } from '../lib/practiceAchievements'
import { getApiError } from '../services/api'
import { practiceService } from '../services/practiceService'
import type { ListPracticeAttemptsData, PracticeAttempt } from '../types/practice'

const PracticeWeeklyChart = lazy(() => import('../components/PracticeWeeklyChart'))

interface LoadedAttempts {
  summary: ListPracticeAttemptsData
  items: PracticeAttempt[]
}

export function PracticeAchievementsPage() {
  const [loaded, setLoaded] = useState<LoadedAttempts | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setLoadError('')
      setProgress('')
      try {
        const first = await practiceService.listAttempts({ page: 1, limit: 100 }, controller.signal)
        const items = [...first.items]
        for (let page = 2; (page - 1) * 100 < first.total; page += 1) {
          if (controller.signal.aborted) return
          setProgress(`Đã tải ${items.length}/${first.total} lượt`)
          const next = await practiceService.listAttempts({ page, limit: 100 }, controller.signal)
          items.push(...next.items)
        }
        const unique = [...new Map(items.map((item) => [item.id, item])).values()]
        if (unique.length !== first.total) throw new Error('Lịch sử vừa thay đổi. Hãy tải lại thành tích.')
        if (!controller.signal.aborted) setLoaded({ summary: first, items: unique })
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error && error.message === 'Lịch sử vừa thay đổi. Hãy tải lại thành tích.' ? error.message : getApiError(error).message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [reload])

  const achievements = useMemo(() => loaded ? calculatePracticeAchievements(loaded.items) : null, [loaded])
  const chartWeeks = achievements?.weeks.slice(achievements.weeks.findIndex((week) => week.count > 0)) ?? []
  const formatOptional = (value: number | null) => value === null ? '—' : formatCentiseconds(value)

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-1">
        <Link to="/luyen-tap" className="inline-flex min-h-11 w-fit items-center text-small font-medium text-link">← Luyện tập</Link>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="text-title font-semibold text-ink">Thành tích</h1>
          {loaded && !loading && !loadError && <span className="text-small text-muted">{loaded.summary.total} lượt</span>}
        </div>
      </header>

      {loading && <p className="inline-flex items-center gap-2 text-small text-muted"><Spinner label="Đang tải thành tích" />Đang tải thành tích... {progress}</p>}
      {loadError && <div className="grid justify-items-start gap-3"><FormNotice message={`Không tải được thành tích: ${loadError}`} /><Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Thử tải lại</Button></div>}

      {!loading && !loadError && loaded && achievements && (loaded.items.length === 0 ? (
        <section className="grid justify-items-start gap-3 border-y border-line py-8">
          <h2 className="text-section font-semibold text-ink">Chưa có lượt luyện tập</h2>
          <p className="text-small text-muted">Bấm giờ lượt đầu tiên để bắt đầu theo dõi thành tích.</p>
          <Link to="/luyen-tap" className="inline-flex min-h-11 items-center font-medium text-link">Bắt đầu luyện tập</Link>
        </section>
      ) : (
        <>
          <section aria-label="Kỷ lục và trung bình">
            <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 lg:grid-cols-3">
              <StatRow label="Nhanh nhất" value={formatOptional(loaded.summary.best_single_cs)} size="compact" />
              <StatRow label="Ao5 tốt nhất" value={formatOptional(loaded.summary.best_ao5_cs)} size="compact" />
              <StatRow label="Ao12 tốt nhất" value={formatOptional(achievements.bestAo12Cs)} size="compact" />
              <StatRow label="Ao12 gần nhất" value={formatOptional(achievements.currentAo12Cs)} size="compact" />
              <StatRow label="Chuỗi hiện tại" value={achievements.currentStreak} unit="ngày" size="compact" />
              <StatRow label="Chuỗi dài nhất" value={achievements.bestStreak} unit="ngày" size="compact" />
            </div>
          </section>

          <section aria-labelledby="weekly-chart" className="grid gap-3">
            <h2 id="weekly-chart" className="text-section font-semibold text-ink">Trung bình theo tuần</h2>
            {achievements.weeks.every((week) => week.count === 0) ? <p className="text-small text-muted">Chưa có lượt nào trong 12 tuần gần đây.</p> : (
              <Suspense fallback={<Spinner label="Đang mở biểu đồ" />}><PracticeWeeklyChart weeks={chartWeeks} /></Suspense>
            )}
            <details className="border-y border-line py-2 text-small">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-link">Cách tính và số liệu</summary>
              <div className="grid gap-2 pb-3 text-muted">
                <p>Ao12: bỏ lượt nhanh nhất và chậm nhất trong 12 lượt liên tiếp, lấy trung bình 10 lượt còn lại.</p>
                <p>Chuỗi ngày: mỗi ngày có ít nhất một lượt, tính theo giờ Việt Nam. Chỉ tính lượt trong Luyện tập.</p>
                <p>Biểu đồ: trung bình từng tuần trong 12 tuần gần nhất.</p>
              </div>
              <div className="grid divide-y divide-line border-t border-line">
                {achievements.weeks.map((week) => (
                  <div key={week.startDate} className="grid grid-cols-[1fr_auto_auto] gap-4 py-2 text-ink">
                    <span>Tuần từ {week.label}</span>
                    <span className="text-muted">{week.count} lượt</span>
                    <span className="min-w-16 text-right font-mono">{formatOptional(week.averageCs)}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </>
      ))}
    </div>
  )
}
