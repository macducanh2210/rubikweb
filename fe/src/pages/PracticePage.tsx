import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cube3DErrorBoundary } from '../components/Cube3DErrorBoundary'
import { Button, CubeNet, FormNotice, Spinner, StatRow } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { applyMoves } from '../lib/cube'
import { createPracticeScramble, formatCentiseconds, solvedPracticeCube } from '../lib/cube/practice'
import { createPracticeKeyboardHandlers, type PracticeTimerPhase } from '../lib/practiceKeyboard'
import { newPracticeRecords } from '../lib/practiceAchievements'
import { getApiError } from '../services/api'
import { practiceService } from '../services/practiceService'
import type {
  CreatePracticeAttemptRequest, ListPracticeAttemptsData,
  PracticeLeaderboardData, PracticeLeaderboardEntry,
} from '../types'

const ScanRubikCube3D = lazy(() => import('../components/RubikCube3D').then((module) => ({ default: module.ScanRubikCube3D })))

function Leaderboard({ title, items, userId }: {
  title: string
  items: PracticeLeaderboardEntry[]
  userId: number | undefined
}) {
  return (
    <section className="grid content-start gap-3" aria-label={title}>
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      {items.length === 0 ? <p className="text-small text-muted">Chưa có đủ lượt để xếp hạng.</p> : (
        <ol className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.user_id} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 py-3 text-small ${item.user_id === userId ? 'font-semibold text-link' : 'text-ink'}`}>
              <span className="font-mono">{item.rank}</span>
              <span className="min-w-0 truncate" title={`${item.display_name} (@${item.username})`}>{item.display_name} <span className="font-normal text-muted">@{item.username}</span></span>
              <span className="font-mono font-semibold">{formatCentiseconds(item.duration_cs)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function PracticePage() {
  const { user } = useAuth()
  const [scramble, setScramble] = useState(createPracticeScramble)
  const [phase, setPhase] = useState<PracticeTimerPhase>('ready')
  const phaseRef = useRef<PracticeTimerPhase>('ready')
  const startedAtRef = useRef(0)
  const pendingAttemptRef = useRef<CreatePracticeAttemptRequest | null>(null)
  const mountedRef = useRef(true)
  const [elapsedCs, setElapsedCs] = useState(0)
  const [lastCs, setLastCs] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<ListPracticeAttemptsData | null>(null)
  const [leaderboard, setLeaderboard] = useState<PracticeLeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [recordNotice, setRecordNotice] = useState('')
  const [webglFailed, setWebglFailed] = useState(false)
  const cubeState = useMemo(() => applyMoves(solvedPracticeCube(), scramble), [scramble])

  const updatePhase = useCallback((next: PracticeTimerPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const refreshData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [own, ranks] = await Promise.all([
        practiceService.listAttempts({ page: 1, limit: 20 }),
        practiceService.getLeaderboard({ limit: 10 }),
      ])
      if (mountedRef.current) {
        setAttempts(own)
        setLeaderboard(ranks)
      }
    } catch (error) {
      if (mountedRef.current) setLoadError(getApiError(error).message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refreshData()
    return () => { mountedRef.current = false }
  }, [refreshData])

  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0
    function tick() {
      setElapsedCs(Math.floor((performance.now() - startedAtRef.current) / 10))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const saveAttempt = useCallback(async (request: CreatePracticeAttemptRequest) => {
    updatePhase('saving')
    setSaveError('')
    try {
      const saved = await practiceService.createAttempt(request)
      if (!mountedRef.current) return
      const records = newPracticeRecords(attempts, saved)
      setRecordNotice(records.length ? `Kỷ lục cá nhân mới: ${records.join(' và ')}!` : '')
      pendingAttemptRef.current = null
      setLastCs(request.duration_cs)
      setScramble(createPracticeScramble())
      updatePhase('ready')
      void refreshData()
    } catch (error) {
      if (!mountedRef.current) return
      setSaveError(getApiError(error).message)
      updatePhase('save-error')
    }
  }, [attempts, refreshData, updatePhase])

  const armTimer = useCallback(() => {
    if (phaseRef.current === 'ready') updatePhase('holding')
  }, [updatePhase])

  const cancelArm = useCallback(() => {
    if (phaseRef.current === 'holding') updatePhase('ready')
  }, [updatePhase])

  const startTimer = useCallback(() => {
    if (phaseRef.current !== 'holding') return
    startedAtRef.current = performance.now()
    setElapsedCs(0)
    setRecordNotice('')
    updatePhase('running')
  }, [updatePhase])

  const stopTimer = useCallback(() => {
    if (phaseRef.current !== 'running') return
    const duration_cs = Math.max(1, Math.round((performance.now() - startedAtRef.current) / 10))
    setElapsedCs(duration_cs)
    const request = { scramble: [...scramble], duration_cs }
    pendingAttemptRef.current = request
    void saveAttempt(request)
  }, [scramble, saveAttempt])

  useEffect(() => {
    const { onKeyDown, onKeyUp, onBlur } = createPracticeKeyboardHandlers({
      getPhase: () => phaseRef.current,
      armTimer, startTimer, stopTimer, cancelArm,
    })
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [armTimer, cancelArm, startTimer, stopTimer])

  const displayedCs = phase === 'running' || phase === 'saving' || phase === 'save-error'
    ? elapsedCs : lastCs ?? 0
  const timerHint = phase === 'holding' ? 'Thả Space để bắt đầu'
    : phase === 'running' ? 'Nhấn Space để dừng'
      : phase === 'saving' ? 'Đang lưu lượt giải...'
        : phase === 'save-error' ? 'Lưu chưa thành công. Thử lưu lại.'
          : 'Giữ Space để chuẩn bị, thả để bắt đầu'
  const cubeFallback = <div role="alert" className="grid justify-items-start gap-2 p-3 text-small text-muted"><p>Không hiển thị được khối 3D. Xem trạng thái trong net.</p><CubeNet faces={cubeState} size="overview" /></div>

  return (
    <div className="grid max-w-5xl gap-8">
      <header className="grid gap-2">
        <h1 className="text-title font-semibold text-ink">Luyện tập</h1>
        <p className="text-small text-muted">Xáo khối thật theo dãy ký hiệu, rồi dùng đồng hồ để đo thời gian giải.</p>
        <div className="flex flex-wrap gap-x-6">
          <Link to="/thu-thach" className="inline-flex min-h-11 items-center text-small font-medium text-link">Thử thách mỗi ngày</Link>
          <Link to="/thanh-tich" className="inline-flex min-h-11 items-center text-small font-medium text-link">Thành tích cá nhân</Link>
        </div>
      </header>

      <section aria-label="Scramble hiện tại" className="grid gap-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section font-semibold text-ink">Scramble 3×3×3</h2>
          <Button variant="secondary" onClick={() => setScramble(createPracticeScramble())} disabled={phase !== 'ready'}>Scramble khác</Button>
        </div>
        <p className="font-mono text-section leading-normal text-ink" aria-label={`Scramble: ${scramble.join(' ')}`}>{scramble.join(' ')}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <section aria-label="Đồng hồ luyện tập" className="grid min-h-64 content-center justify-items-center gap-4 border-y border-line py-8 text-center lg:min-h-96">
          <p className={`font-mono text-[clamp(64px,16vw,128px)] font-semibold leading-none ${phase === 'holding' ? 'text-success' : 'text-ink'}`} role="timer" aria-live={phase === 'running' ? 'off' : 'polite'}>{formatCentiseconds(displayedCs)}</p>
          <p className="text-body text-muted">{timerHint}</p>
          {phase === 'ready' || phase === 'holding' ? (
            <Button
              variant="secondary"
              onPointerDown={armTimer}
              onPointerUp={startTimer}
              onPointerCancel={cancelArm}
              onPointerLeave={cancelArm}
            >Giữ để bắt đầu</Button>
          ) : phase === 'running' ? <Button onClick={stopTimer}>Dừng đồng hồ</Button>
            : phase === 'saving' ? <Spinner label="Đang lưu lượt giải" /> : null}
          {phase === 'save-error' && pendingAttemptRef.current && (
            <Button onClick={() => { if (pendingAttemptRef.current) void saveAttempt(pendingAttemptRef.current) }}>Thử lưu lại</Button>
          )}
          {saveError && <FormNotice message={`Không lưu được lượt luyện tập: ${saveError}`} />}
          {recordNotice && <FormNotice tone="success" message={recordNotice} />}
        </section>

        <section aria-label="Khối Rubik sau scramble" className="grid min-w-0 content-start gap-2">
          <h2 className="text-section font-semibold text-ink">Khối sau scramble</h2>
          <p className="text-small text-muted">Kéo khối để đối chiếu các mặt trước khi giải.</p>
          {webglFailed ? cubeFallback : (
            <Cube3DErrorBoundary fallback={cubeFallback} onError={() => setWebglFailed(true)}>
              <Suspense fallback={<div className="grid h-72 place-items-center"><Spinner label="Đang mở khối 3D" /></div>}>
                <div className="h-72 min-w-0 w-full sm:h-80">
                  <ScanRubikCube3D faces={cubeState} onWebGLError={() => setWebglFailed(true)} ariaLabel="Mô hình Rubik 3D sau scramble; kéo để xoay góc nhìn" />
                </div>
              </Suspense>
            </Cube3DErrorBoundary>
          )}
        </section>
      </div>

      <section className="grid gap-4" aria-label="Thống kê luyện tập của bạn">
        <h2 className="text-section font-semibold text-ink">Kết quả của bạn</h2>
        {loading && <p className="inline-flex items-center gap-2 text-small text-muted"><Spinner label="Đang tải kết quả" />Đang tải kết quả...</p>}
        {loadError && <div className="grid justify-items-start gap-2"><FormNotice message={`Không tải được kết quả: ${loadError}`} /><Button variant="secondary" onClick={() => void refreshData()}>Thử tải lại</Button></div>}
        {attempts && (
          <>
            <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
              <StatRow label="Số lượt" value={attempts.total} />
              <StatRow label="Nhanh nhất" value={attempts.best_single_cs === null ? '—' : formatCentiseconds(attempts.best_single_cs)} />
              <StatRow label="Ao5 gần nhất" value={attempts.current_ao5_cs === null ? '—' : formatCentiseconds(attempts.current_ao5_cs)} />
              <StatRow label="Ao5 tốt nhất" value={attempts.best_ao5_cs === null ? '—' : formatCentiseconds(attempts.best_ao5_cs)} />
            </div>
            {attempts.items.length === 0 ? <p className="text-small text-muted">Chưa có lượt nào. Giữ Space để bắt đầu lượt đầu tiên.</p> : (
              <div className="grid gap-2">
                <h3 className="text-small font-semibold text-ink">Các lượt gần đây</h3>
                <ol className="divide-y divide-line border-y border-line">
                  {attempts.items.slice(0, 10).map((attempt, index) => (
                    <li key={attempt.id} className="grid grid-cols-[2rem_1fr_auto] gap-3 py-2 text-small text-ink">
                      <span className="text-muted">{attempts.total - index}</span>
                      <span className="font-mono">{formatCentiseconds(attempt.duration_cs)}</span>
                      <span className="font-mono text-muted">Ao5: {attempt.ao5_cs === null ? '—' : formatCentiseconds(attempt.ao5_cs)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid gap-8 border-t border-line pt-6 md:grid-cols-2" aria-label="Bảng xếp hạng người chơi">
        <Leaderboard title="Nhanh nhất một lượt" items={leaderboard?.single ?? []} userId={user?.id} />
        <Leaderboard title="Ao5 tốt nhất" items={leaderboard?.ao5 ?? []} userId={user?.id} />
      </div>
      <p className="text-caption text-muted">Ao5 bỏ lượt nhanh nhất và chậm nhất trong 5 lượt liên tiếp, rồi lấy trung bình 3 lượt còn lại. Bảng xếp hạng dựa trên thời gian do người chơi tự bấm.</p>
    </div>
  )
}
