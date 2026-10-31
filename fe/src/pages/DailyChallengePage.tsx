import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cube3DErrorBoundary } from '../components/Cube3DErrorBoundary'
import { Button, CubeNet, FormNotice, Spinner, StatRow } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { applyMoves } from '../lib/cube'
import { formatCentiseconds, solvedPracticeCube } from '../lib/cube/practice'
import { challengeDeadline, dailyAttemptDuration, readPendingDailyAttempt, remainingAtDeadline } from '../lib/dailyChallenge'
import { createPracticeKeyboardHandlers, type PracticeTimerPhase } from '../lib/practiceKeyboard'
import { getApiError } from '../services/api'
import { dailyChallengeService } from '../services/dailyChallengeService'
import type { CreateDailyAttemptRequest, DailyChallengeData, DailyLeaderboardData } from '../types'

const ScanRubikCube3D = lazy(() => import('../components/RubikCube3D').then((module) => ({ default: module.ScanRubikCube3D })))

export function DailyChallengePage() {
  const { user } = useAuth()
  const [challenge, setChallenge] = useState<DailyChallengeData | null>(null)
  const [ranks, setRanks] = useState<DailyLeaderboardData | null>(null)
  const [phase, setPhase] = useState<PracticeTimerPhase>('ready')
  const phaseRef = useRef<PracticeTimerPhase>('ready')
  const challengeRef = useRef<DailyChallengeData | null>(null)
  const challengeAvailableRef = useRef(false)
  const deadlineRef = useRef(0)
  const startedAtRef = useRef(0)
  const pendingRef = useRef<CreateDailyAttemptRequest | null>(null)
  const mountedRef = useRef(false)
  const [elapsedCs, setElapsedCs] = useState(0)
  const [remainingMs, setRemainingMs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [webglFailed, setWebglFailed] = useState(false)
  const storageKey = `cubemate:daily-pending:${user?.id ?? 'guest'}`
  const cube = useMemo(() => challenge ? applyMoves(solvedPracticeCube(), challenge.scramble) : null, [challenge])

  const updatePhase = useCallback((next: PracticeTimerPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const clearPending = useCallback(() => {
    pendingRef.current = null
    try { localStorage.removeItem(storageKey) } catch { /* The server still enforces a single attempt. */ }
  }, [storageKey])

  const refreshRanks = useCallback(async (id: number) => {
    try {
      const data = await dailyChallengeService.getLeaderboard({ challenge_id: id, limit: 20 })
      if (mountedRef.current && challengeRef.current?.id === id) {
        setRanks(data)
        setLoadError('')
      }
    } catch (error) {
      if (mountedRef.current) setLoadError(getApiError(error).message)
    }
  }, [])

  const refreshChallenge = useCallback(async () => {
    challengeAvailableRef.current = false
    setLoading(true)
    setLoadError('')
    const requestStartedAt = performance.now()
    try {
      const data = await dailyChallengeService.getChallenge()
      if (!mountedRef.current) return
      challengeRef.current = data
      challengeAvailableRef.current = true
      setChallenge(data)
      setRanks(null)
      deadlineRef.current = challengeDeadline(data, requestStartedAt)
      const remaining = remainingAtDeadline(deadlineRef.current, performance.now())
      setRemainingMs(remaining)
      if (!pendingRef.current) updatePhase('ready')
      await refreshRanks(data.id)
    } catch (error) {
      if (mountedRef.current) setLoadError(getApiError(error).message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [refreshRanks, updatePhase])

  useEffect(() => {
    mountedRef.current = true
    try { pendingRef.current = readPendingDailyAttempt(localStorage.getItem(storageKey)) } catch { pendingRef.current = null }
    if (pendingRef.current) {
      setElapsedCs(pendingRef.current.duration_cs)
      updatePhase('save-error')
      setSaveError('Có một lượt chưa xác nhận đã lưu. Hãy thử lưu lại để kiểm tra kết quả.')
    }
    void refreshChallenge()
    return () => { mountedRef.current = false }
  }, [refreshChallenge, storageKey, updatePhase])

  useEffect(() => {
    if (!challenge) return
    const timer = window.setInterval(() => setRemainingMs(remainingAtDeadline(deadlineRef.current, performance.now())), 1000)
    return () => window.clearInterval(timer)
  }, [challenge])

  const saveAttempt = useCallback(async (request: CreateDailyAttemptRequest) => {
    updatePhase('saving')
    setSaveError('')
    try {
      const result = await dailyChallengeService.createAttempt(request)
      if (!mountedRef.current) return
      clearPending()
      setElapsedCs(result.duration_cs)
      updatePhase('ready')
      if (challengeRef.current?.id === request.challenge_id) {
        const next = { ...challengeRef.current, my_attempt: result }
        challengeRef.current = next
        setChallenge(next)
        await refreshRanks(request.challenge_id)
      } else await refreshChallenge()
    } catch (error) {
      if (!mountedRef.current) return
      const failure = getApiError(error)
      if (failure.kind === 'api' && ['DAILY_CHALLENGE_EXPIRED', 'DAILY_ATTEMPT_EXISTS', 'ATTEMPT_CONFLICT', 'DAILY_CHALLENGE_NOT_FOUND'].includes(failure.errorCode)) {
        clearPending()
        updatePhase('ready')
        setSaveError(failure.message)
        // Reconcile another tab's official attempt or a rollover; never relabel an old scramble.
        await refreshChallenge()
      } else {
        setSaveError(failure.message)
        updatePhase('save-error')
      }
    }
  }, [clearPending, refreshChallenge, refreshRanks, updatePhase])

  const armTimer = useCallback(() => {
    if (phaseRef.current === 'ready' && challengeAvailableRef.current && challengeRef.current && !challengeRef.current.my_attempt
      && !pendingRef.current && !loading && performance.now() < deadlineRef.current) updatePhase('holding')
  }, [loading, updatePhase])
  const cancelArm = useCallback(() => {
    if (phaseRef.current === 'holding') updatePhase('ready')
  }, [updatePhase])
  useEffect(() => {
    if (challenge && remainingMs === 0) cancelArm()
  }, [challenge, remainingMs, cancelArm])
  const startTimer = useCallback(() => {
    if (phaseRef.current !== 'holding') return
    if (performance.now() >= deadlineRef.current) { updatePhase('ready'); return }
    startedAtRef.current = performance.now()
    setElapsedCs(0)
    updatePhase('running')
  }, [updatePhase])
  const stopTimer = useCallback(() => {
    if (phaseRef.current !== 'running' || !challengeRef.current) return
    const duration_cs = dailyAttemptDuration(startedAtRef.current, performance.now())
    setElapsedCs(duration_cs)
    const request: CreateDailyAttemptRequest = { challenge_id: challengeRef.current.id, duration_cs, client_attempt_id: crypto.randomUUID() }
    pendingRef.current = request
    try { localStorage.setItem(storageKey, JSON.stringify(request)) } catch { /* Retry remains available in memory. */ }
    void saveAttempt(request)
  }, [saveAttempt, storageKey])

  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0
    function tick() {
      const elapsed = Math.floor((performance.now() - startedAtRef.current) / 10)
      setElapsedCs(Math.min(360000, elapsed))
      if (elapsed >= 360000) { stopTimer(); return }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, stopTimer])

  useEffect(() => {
    const handlers = createPracticeKeyboardHandlers({ getPhase: () => phaseRef.current, armTimer, startTimer, stopTimer, cancelArm })
    window.addEventListener('keydown', handlers.onKeyDown, true)
    window.addEventListener('keyup', handlers.onKeyUp, true)
    window.addEventListener('blur', handlers.onBlur)
    return () => {
      window.removeEventListener('keydown', handlers.onKeyDown, true)
      window.removeEventListener('keyup', handlers.onKeyUp, true)
      window.removeEventListener('blur', handlers.onBlur)
    }
  }, [armTimer, startTimer, stopTimer, cancelArm])

  const expired = Boolean(challenge && remainingMs === 0)
  const finished = Boolean(challenge?.my_attempt)
  const idle = phase === 'ready'
  const display = finished && idle ? challenge!.my_attempt!.duration_cs : elapsedCs
  const hint = phase === 'holding' ? 'Thả Space để bắt đầu' : phase === 'running' ? 'Nhấn Space để kết thúc lượt chính thức'
    : phase === 'saving' ? 'Đang lưu kết quả...' : phase === 'save-error' ? 'Thử lưu lại kết quả bên dưới'
      : finished ? 'Bạn đã hoàn thành lượt chính thức hôm nay' : expired ? 'Thử thách đã hết ngày' : 'Giữ Space để chuẩn bị, thả để bắt đầu'
  const fallback = cube && <CubeNet faces={cube} size="overview" />

  return (
    <div className="grid max-w-5xl gap-7">
      <header className="grid gap-2">
        <Link to="/luyen-tap" className="inline-flex min-h-11 items-center justify-self-start text-small text-link">Luyện tập tự do</Link>
        <h1 className="text-title font-semibold">Thử thách mỗi ngày</h1>
        <p className="text-small text-muted">Cùng một scramble cho tất cả mọi người. Mỗi tài khoản có một lượt chính thức; ngày mới bắt đầu lúc 00:00 giờ Việt Nam.</p>
      </header>
      {loading && <div className="inline-flex items-center gap-2 text-small"><Spinner label="Đang tải thử thách" />Đang tải thử thách...</div>}
      {loadError && <div className="grid justify-items-start gap-2"><FormNotice message={loadError} /><Button variant="secondary" disabled={!idle && phase !== 'save-error'} onClick={() => void refreshChallenge()}>Thử tải lại</Button></div>}
      {challenge && <>
        <section aria-label="Scramble chung hôm nay" className="grid gap-3 border-y border-line py-4">
          <div className="flex flex-wrap justify-between gap-2 text-small"><h2 className="font-semibold">Ngày {challenge.date.split('-').reverse().join('/')}</h2><span className="text-muted">{expired ? 'Đã kết thúc' : `Còn ${Math.floor(remainingMs / 3600000)} giờ ${Math.floor(remainingMs % 3600000 / 60000)} phút`}</span></div>
          <p className="font-mono text-section leading-normal" aria-label={`Scramble: ${challenge.scramble.join(' ')}`}>{challenge.scramble.join(' ')}</p>
        </section>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
          <section aria-label="Đồng hồ thử thách" className="grid min-h-64 content-center justify-items-center gap-4 py-6 text-center">
            <p role="timer" aria-live={phase === 'running' ? 'off' : 'polite'} className={`font-mono text-[clamp(56px,15vw,112px)] font-semibold leading-none ${phase === 'holding' ? 'text-success' : 'text-ink'}`}>{formatCentiseconds(display)}</p>
            <p className="text-small text-muted">{hint}</p>
            {!finished && !expired && (idle || phase === 'holding') && <Button variant="secondary" disabled={loading || !challengeAvailableRef.current} onPointerDown={armTimer} onPointerUp={startTimer} onPointerCancel={cancelArm} onPointerLeave={cancelArm}>Giữ để bắt đầu</Button>}
            {phase === 'running' && <Button onClick={stopTimer}>Kết thúc lượt thi</Button>}
            {phase === 'saving' && <Spinner label="Đang lưu lượt thi" />}
            {phase === 'save-error' && pendingRef.current && <Button onClick={() => { if (pendingRef.current) void saveAttempt(pendingRef.current) }}>Thử lưu lại</Button>}
            {saveError && <FormNotice message={saveError} />}
            {expired && idle && <Button variant="secondary" disabled={loading} onClick={() => { setElapsedCs(0); void refreshChallenge() }}>Tải thử thách ngày mới</Button>}
            {!finished && !expired && idle && <p className="text-caption text-muted">Xáo khối thật xong trước khi bấm giờ. Khi kết thúc, kết quả được lưu chính thức.</p>}
            {finished && <Link to="/luyen-tap" className="inline-flex min-h-11 items-center text-small text-link">Tiếp tục luyện tập tự do</Link>}
          </section>
          <section aria-label="Khối sau scramble" className="grid min-w-0 gap-2">
            <h2 className="text-section font-semibold">Khối sau scramble</h2>
            <p className="text-small text-muted">Kéo để đối chiếu. F hướng về bạn, U ở trên.</p>
            {webglFailed ? fallback : <Cube3DErrorBoundary fallback={fallback} onError={() => setWebglFailed(true)}><Suspense fallback={<div className="grid h-72 place-items-center"><Spinner label="Đang mở khối 3D" /></div>}><div className="h-72 w-full sm:h-80"><ScanRubikCube3D faces={cube!} onWebGLError={() => setWebglFailed(true)} ariaLabel="Khối Rubik 3D sau scramble thử thách" /></div></Suspense></Cube3DErrorBoundary>}
          </section>
        </div>
        <section className="grid gap-4 border-t border-line pt-5" aria-label="Bảng xếp hạng ngày">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-section font-semibold">Bảng xếp hạng ngày</h2><Button variant="ghost" onClick={() => void refreshRanks(challenge.id)}>Làm mới bảng</Button></div>
          <div className="grid gap-x-6 sm:grid-cols-2"><StatRow label="Người tham gia" value={ranks?.total_participants ?? '—'} /><StatRow label="Hạng của bạn" value={ranks?.my_rank ?? '—'} /></div>
          {ranks && (ranks.items.length === 0 ? <p className="text-small text-muted">Chưa có kết quả. Bạn có thể là người đầu tiên hôm nay.</p> : <ol className="divide-y divide-line border-y border-line">{ranks.items.map((entry) => <li key={entry.user_id} className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-3 text-small ${entry.user_id === user?.id ? 'font-semibold text-link' : 'text-ink'}`}><span className="font-mono">{entry.rank}</span><span className="truncate" title={`${entry.display_name} (@${entry.username})`}>{entry.display_name} <span className="font-normal text-muted">@{entry.username}</span></span><span className="font-mono font-semibold">{formatCentiseconds(entry.duration_cs)}</span></li>)}</ol>)}
          <p className="text-caption text-muted">Xếp theo thời gian do người chơi tự bấm. Cùng thời gian thì lượt lưu sớm hơn đứng trước.</p>
        </section>
      </>}
    </div>
  )
}
