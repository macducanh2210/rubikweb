import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker, useNavigate } from 'react-router-dom'
import { Cube3DErrorBoundary } from '../components/Cube3DErrorBoundary'
import type { MoveCommand } from '../components/RubikCube3D'
import { Button, ConfirmDialog, CubeNet, EmptyState, FormNotice, MoveChip, SelectField, Spinner, StatRow, StatusBadge, ToggleField } from '../components/ui'
import { useSolveSession, type SolveSession } from '../context/SolveSessionContext'
import { applyMove, invertMove, isCubeMove, solutionMatchesState } from '../lib/cube'
import { autoPauseMs, estimateSolutionDurationMs, maxSpeechWaitMs, moveDurationMs } from '../lib/cube/animationConfig'
import { describeMoveForSpeech } from '../lib/cube/moveSpeech'
import { movingStepIndex } from '../lib/cube/moveStepView'
import { getApiError } from '../services/api'
import { historyService } from '../services/historyService'
import { settingsService } from '../services/settingsService'
import type { AnimationSpeed, CubeState, SolveStatus } from '../types'

interface PendingCommand extends MoveCommand { targetStep: number; automatic: boolean }
type PracticeStatus = 'idle' | 'running' | 'saving' | SolveStatus

const RubikCube3D = lazy(() => import('../components/RubikCube3D').then((module) => ({ default: module.RubikCube3D })))
const speedOptions = [
  { value: 'slow', label: 'Chậm' }, { value: 'normal', label: 'Bình thường' }, { value: 'fast', label: 'Nhanh' },
] as const
const faceNamesStorageKey = 'rubik.showFaceNames'
const readMovesStorageKey = 'rubik.readMoves'
const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

function storedFaceNamesPreference(): boolean {
  try {
    return localStorage.getItem(faceNamesStorageKey) !== 'false'
  } catch {
    return true
  }
}

function storedReadMovesPreference(): boolean {
  try {
    return localStorage.getItem(readMovesStorageKey) === 'true'
  } catch {
    return false
  }
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function formatEstimatedDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `khoảng ${seconds} giây`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `khoảng ${minutes} phút${remainingSeconds ? ` ${remainingSeconds} giây` : ''}`
}

function SolverSession({ session }: { session: SolveSession }) {
  const [cubeState, setCubeState] = useState<CubeState>(session.cubeState)
  const [step, setStep] = useState(0)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [command, setCommand] = useState<PendingCommand | null>(null)
  const [playing, setPlaying] = useState(false)
  const [lastCompletedAuto, setLastCompletedAuto] = useState(false)
  const [speed, setSpeed] = useState<AnimationSpeed>('normal')
  const [showFaceNames, setShowFaceNames] = useState(storedFaceNamesPreference)
  const [readMoves, setReadMoves] = useState(() => speechAvailable && storedReadMovesPreference())
  const [speechActive, setSpeechActive] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [webglFailed, setWebglFailed] = useState(() => !supportsWebGL())
  const [practiceStatus, setPracticeStatus] = useState<PracticeStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [practiceError, setPracticeError] = useState('')
  const commandIdRef = useRef(0)
  const commandRef = useRef<PendingCommand | null>(null)
  const speechIdRef = useRef(0)
  const speechTimeoutRef = useRef<number | null>(null)
  const playbackStartedAtRef = useRef(0)
  const lastAutoCompletedAtRef = useRef(0)
  const practiceStartRef = useRef<Date | null>(null)
  const practiceStatusRef = useRef<PracticeStatus>('idle')
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])
  const moves = session.result.moves
  const replay = session.mode === 'replay'
  const solutionValid = useMemo(() => solutionMatchesState(session.cubeState, moves), [session.cubeState, moves])

  const stopSpeech = useCallback(() => {
    speechIdRef.current += 1
    if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
    speechTimeoutRef.current = null
    if (speechAvailable) window.speechSynthesis.cancel()
    setSpeechActive(false)
  }, [])

  useEffect(() => () => {
    speechIdRef.current += 1
    if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
    if (speechAvailable) window.speechSynthesis.cancel()
  }, [])

  function speakMove(move: string, undo: boolean) {
    if (!readMoves || !speechAvailable) return
    const speech = window.speechSynthesis
    const speechId = ++speechIdRef.current
    if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
    speech.cancel()
    const utterance = new SpeechSynthesisUtterance(describeMoveForSpeech(move, undo))
    utterance.lang = 'vi-VN'
    utterance.rate = 1.15
    utterance.voice = speech.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('vi')) ?? null
    utterance.onend = () => {
      if (speechId !== speechIdRef.current) return
      if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
      speechTimeoutRef.current = null
      setSpeechActive(false)
    }
    utterance.onerror = (event) => {
      if (speechId !== speechIdRef.current) return
      if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
      speechTimeoutRef.current = null
      setSpeechActive(false)
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        setSpeechError('Không phát được giọng nói trên thiết bị này. Bạn vẫn có thể theo dõi ký hiệu trên màn hình.')
      }
    }
    setSpeechActive(true)
    speechTimeoutRef.current = window.setTimeout(() => {
      if (speechId !== speechIdRef.current) return
      speechIdRef.current += 1
      speech.cancel()
      speechTimeoutRef.current = null
      setSpeechActive(false)
      setSpeechError('Giọng đọc không phản hồi. Bạn vẫn có thể theo dõi ký hiệu trên màn hình.')
    }, maxSpeechWaitMs)
    try {
      speech.speak(utterance)
    } catch {
      if (speechTimeoutRef.current !== null) window.clearTimeout(speechTimeoutRef.current)
      speechTimeoutRef.current = null
      setSpeechActive(false)
      setSpeechError('Không phát được giọng nói trên thiết bị này. Bạn vẫn có thể theo dõi ký hiệu trên màn hình.')
    }
  }

  useEffect(() => {
    if (solutionValid) return
    console.error('Lời giải không khớp với trạng thái khối', {
      rubik_state_id: session.rubikStateId,
      cube_state: session.cubeState,
      solution_id: session.result.solution_id,
      moves,
      total_steps: session.result.total_steps,
    })
  }, [solutionValid, session, moves])

  useEffect(() => {
    let cancelled = false
    settingsService.getSettings()
      .then((settings) => { if (!cancelled) setSpeed(settings.animation_speed) })
      .catch((error: unknown) => { if (!cancelled) setSettingsError(getApiError(error).message) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (practiceStatus !== 'running') return
    const timer = window.setInterval(() => {
      if (practiceStartRef.current) setElapsedMs(Date.now() - practiceStartRef.current.getTime())
    }, 250)
    return () => window.clearInterval(timer)
  }, [practiceStatus])

  useEffect(() => {
    if (moves.length === 0 || (step === 0 && highlightedIndex === 0)) return
    chipRefs.current[highlightedIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [highlightedIndex, moves.length, step])

  const completeCommand = useCallback((finished: MoveCommand) => {
    const pending = commandRef.current
    if (!pending || pending.id !== finished.id) return
    commandRef.current = null
    setCubeState((state) => applyMove(state, finished.move))
    setStep(pending.targetStep)
    setCommand(null)
    setLastCompletedAuto(pending.automatic)
    if (pending.automatic) lastAutoCompletedAtRef.current = performance.now()
    if (pending.targetStep >= moves.length) setPlaying(false)
  }, [moves.length])

  useEffect(() => {
    if (webglFailed && command) completeCommand(command)
  }, [webglFailed, command, completeCommand])

  function queueMove(move: string, targetStep: number, automatic = false) {
    if (commandRef.current || !isCubeMove(move)) return
    const moveIndex = movingStepIndex(step, targetStep)
    // The face turn is the instruction itself, so keep its selected speed even
    // when the browser asks to reduce decorative motion.
    const durationMs = moveDurationMs(move, speed)
    const pending: PendingCommand = { id: ++commandIdRef.current, move, targetStep, automatic, durationMs }
    commandRef.current = pending
    setHighlightedIndex(moveIndex)
    setCommand(pending)
    speakMove(move, targetStep < step)
  }

  useEffect(() => {
    if (!playing || command || step >= moves.length || !solutionValid || speechActive) return
    const pauseMs = autoPauseMs(speed, lastCompletedAuto)
    const startedAt = lastCompletedAuto ? lastAutoCompletedAtRef.current : playbackStartedAtRef.current
    const remainingMs = Math.max(0, startedAt + pauseMs - performance.now())
    const timer = window.setTimeout(() => queueMove(moves[step], step + 1, true), remainingMs)
    return () => window.clearTimeout(timer)
  }, [playing, command, step, moves, solutionValid, speed, lastCompletedAuto, speechActive, readMoves])

  function nextStep() {
    if (step < moves.length) queueMove(moves[step], step + 1)
  }

  function previousStep() {
    if (step > 0) queueMove(invertMove(moves[step - 1]), step - 1)
  }

  function togglePlayback() {
    if (!playing) playbackStartedAtRef.current = performance.now()
    setLastCompletedAuto(false)
    setPlaying((value) => !value)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (document.querySelector('dialog[open], [role="dialog"]')) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="textbox"]')) return

      if (event.key === ' ' || event.key === 'Spacebar') {
        if (target instanceof Element && target.closest('button, a, summary, [role="button"]')) return
        if (!solutionValid || (step === moves.length && !playing)) return
        event.preventDefault()
        togglePlayback()
      } else if (event.key === 'ArrowRight') {
        if (command || !solutionValid || step >= moves.length) return
        event.preventDefault()
        nextStep()
      } else if (event.key === 'ArrowLeft') {
        if (command || !solutionValid || step === 0) return
        event.preventDefault()
        previousStep()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [command, moves, playing, solutionValid, speed, step])

  function resetSteps() {
    if (commandRef.current) return
    setPlaying(false)
    setLastCompletedAuto(false)
    stopSpeech()
    setCubeState(session.cubeState)
    setStep(0)
    setHighlightedIndex(0)
  }

  function updateFaceNames(checked: boolean) {
    setShowFaceNames(checked)
    try {
      localStorage.setItem(faceNamesStorageKey, String(checked))
    } catch {
      // Keep the preference for this page when browser storage is unavailable.
    }
  }

  function updateReadMoves(checked: boolean) {
    setReadMoves(checked)
    setSpeechError('')
    if (!checked) stopSpeech()
    try {
      localStorage.setItem(readMovesStorageKey, String(checked))
    } catch {
      // Giữ lựa chọn trong phiên hiện tại khi trình duyệt không cho lưu.
    }
  }

  function startPractice() {
    const started = new Date()
    practiceStartRef.current = started
    practiceStatusRef.current = 'running'
    setPracticeStatus('running')
    setPracticeError('')
    setElapsedMs(0)
  }

  async function savePractice(status: SolveStatus): Promise<boolean> {
    const started = practiceStartRef.current
    if (!started || practiceStatusRef.current !== 'running') return false
    const ended = new Date()
    if (ended.getTime() - started.getTime() < 1000) {
      setPracticeError('Thời gian quá ngắn để lưu. Hãy đợi ít nhất một giây.')
      return false
    }
    practiceStatusRef.current = 'saving'
    setPracticeStatus('saving')
    setPracticeError('')
    try {
      await historyService.create({
        solution_id: session.result.solution_id,
        start_time: started.toISOString(),
        end_time: ended.toISOString(),
        status,
      })
      practiceStatusRef.current = status
      setPracticeStatus(status)
      setElapsedMs(ended.getTime() - started.getTime())
      return true
    } catch (error) {
      const issue = getApiError(error)
      setPracticeError(issue.kind === 'api' && issue.errorCode === 'INVALID_TIME_RANGE'
        ? `${issue.message} Kiểm tra thời gian rồi thử lưu lại.`
        : issue.message)
      practiceStatusRef.current = 'running'
      setPracticeStatus('running')
      return false
    }
  }

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    practiceStatus === 'running' && currentLocation.pathname !== nextLocation.pathname)

  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (practiceStatusRef.current === 'running') {
      event.preventDefault()
      event.returnValue = ''
    }
  }, []))

  useEffect(() => {
    if (replay) return
    const onPageHide = () => {
      const started = practiceStartRef.current
      if (!started || practiceStatusRef.current !== 'running') return
      const ended = new Date()
      if (ended.getTime() - started.getTime() < 1000) return
      historyService.saveAbandonedOnPageHide({
        solution_id: session.result.solution_id,
        start_time: started.toISOString(), end_time: ended.toISOString(), status: 'abandoned',
      })
      practiceStatusRef.current = 'abandoned'
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [replay, session.result.solution_id])

  const fallback = (
    <div role="alert" className="grid justify-items-start gap-3 p-4">
      <p className="text-small text-ink">Không hiển thị được khối 3D. Dùng net sáu mặt và dãy ký hiệu bên dưới để theo dõi.</p>
      <CubeNet faces={cubeState} size="overview" />
    </div>
  )
  const controlsBusy = command !== null || !solutionValid
  const estimatedDurationMs = solutionValid ? estimateSolutionDurationMs(moves, speed) : null
  const nextMove = solutionValid && highlightedIndex === step && step < moves.length && isCubeMove(moves[step]) ? moves[step] : null
  const guideMove = command?.move ?? nextMove
  const isDoubleTurn = guideMove?.endsWith('2') ?? false

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="grid gap-2">
        <h1 className="text-title font-semibold text-ink">{replay ? 'Xem lại lời giải' : 'Lời giải'}</h1>
        <p className="text-small text-muted">{replay ? 'Xem lại các bước xoay của lượt giải đã lưu.' : 'Kéo khối để đổi góc nhìn, rồi theo dõi từng bước xoay.'}</p>
      </div>

      <section aria-label="Khối Rubik" className="relative min-h-72 min-w-0 overflow-hidden bg-page sm:min-h-96">
        {isDoubleTurn && !webglFailed && (
          <span className="pointer-events-none absolute left-[calc(50%+112px)] top-3 z-10 font-mono text-display font-semibold leading-none text-ink sm:left-[calc(50%+180px)] sm:top-4 sm:text-[64px]" aria-label="Xoay hai lần" aria-live="polite">
            2X
          </span>
        )}
        {webglFailed ? fallback : (
          <Cube3DErrorBoundary fallback={fallback} onError={() => setWebglFailed(true)}>
            <Suspense fallback={<div className="grid h-72 place-items-center sm:h-96"><Spinner label="Đang mở khối 3D" /></div>}>
              <div className="h-72 min-w-0 w-full sm:h-96">
                <RubikCube3D state={cubeState} command={command} hintMove={nextMove} showFaceNames={showFaceNames} onMoveComplete={completeCommand} onWebGLError={() => setWebglFailed(true)} />
              </div>
            </Suspense>
          </Cube3DErrorBoundary>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-x-6">
        <ToggleField id="show-face-names" label="Hiện tên mặt" checked={showFaceNames} onChange={(event) => updateFaceNames(event.target.checked)} disabled={webglFailed} />
        <ToggleField id="read-moves" label="Đọc bước giải" checked={readMoves} onChange={(event) => updateReadMoves(event.target.checked)} disabled={!speechAvailable || !solutionValid || moves.length === 0} />
      </div>
      {!speechAvailable && <p className="text-small text-muted">Trình duyệt này không hỗ trợ đọc bước giải.</p>}
      {speechError && <FormNotice message={speechError} />}

      <div className="grid gap-1 sm:grid-cols-2 sm:gap-6">
        <StatRow label="Tổng số bước" value={session.result.total_steps} />
        {session.mode === 'live' && (session.source === 'manual'
          ? <StatRow label="Nguồn màu" value="Nhập bằng tay" />
          : <StatRow label="Độ tin cậy" value={Math.round(session.confidenceScore * 100)} unit="%" />)}
      </div>

      {!solutionValid && <FormNotice message="Lời giải không khớp với trạng thái khối. Hãy quét lại." />}
      {moves.length === 0 ? (
        <p className="text-body text-ink">Khối đã được giải sẵn.</p>
      ) : (
        <section className="grid gap-4" aria-label="Các bước giải">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section font-semibold text-ink">Các bước xoay</h2>
            <span className="font-mono text-small text-ink">Bước {highlightedIndex + 1} / {session.result.total_steps}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
            {moves.map((move, index) => (
              <span key={`${index}-${move}`} ref={(element) => { chipRefs.current[index] = element }}>
                <MoveChip move={move} step={index + 1} active={index === highlightedIndex} completed={index < step} />
              </span>
            ))}
          </div>
          <details className="border-t border-line pt-2 text-small text-ink">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Cách đọc ký hiệu</summary>
            <div className="grid gap-1 pb-2">
              <p>Chữ cái U, D, F, B, L, R: xoay mặt đó thuận chiều kim đồng hồ khi nhìn thẳng vào mặt.</p>
              <p>Dấu ' là xoay ngược chiều kim đồng hồ. Số 2 là xoay nửa vòng.</p>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetSteps} disabled={controlsBusy || step === 0}>Về đầu</Button>
            <Button variant="secondary" onClick={previousStep} aria-keyshortcuts="ArrowLeft" disabled={controlsBusy || step === 0}>Bước trước</Button>
            <Button variant="secondary" onClick={togglePlayback} aria-keyshortcuts="Space" disabled={!solutionValid || (step === moves.length && !playing)}>{playing ? 'Tạm dừng' : 'Phát'}</Button>
            <Button variant="secondary" onClick={nextStep} aria-keyshortcuts="ArrowRight" disabled={controlsBusy || step === moves.length}>Bước sau</Button>
          </div>
          <p className="text-small text-muted">Phím tắt: Space phát/tạm dừng, ← bước trước, → bước sau.</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-44 sm:w-56">
              <SelectField id="animation-speed" label="Tốc độ" value={speed} onChange={(event) => setSpeed(event.target.value as AnimationSpeed)} options={speedOptions} />
            </div>
            {estimatedDurationMs !== null && <p className="pb-3 text-small text-muted">{formatEstimatedDuration(estimatedDurationMs)}{readMoves ? ' (có thể lâu hơn khi đọc)' : ''}</p>}
          </div>
          {settingsError && <FormNotice message={`Không tải được tốc độ đã lưu: ${settingsError} Đang dùng tốc độ bình thường.`} />}
        </section>
      )}

      {!replay && (
        <section className="grid gap-4 border-t border-line pt-5" aria-label="Luyện tập">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-section font-semibold text-ink">Luyện tập</h2>
            <span className="font-mono text-title font-semibold text-ink" role="timer">{formatElapsed(elapsedMs)}</span>
          </div>
          {practiceStatus === 'idle' && <Button className="w-fit" onClick={startPractice}>Bắt đầu luyện tập</Button>}
          {(practiceStatus === 'running' || practiceStatus === 'saving') && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void savePractice('completed')} loading={practiceStatus === 'saving'}>Hoàn thành</Button>
              <Button variant="secondary" onClick={() => void savePractice('abandoned')} disabled={practiceStatus === 'saving'}>Bỏ dở</Button>
            </div>
          )}
          {practiceStatus === 'completed' && <StatusBadge tone="success" label="Đã lưu lượt hoàn thành" />}
          {practiceStatus === 'abandoned' && <StatusBadge tone="warning" label="Đã lưu lượt bỏ dở" />}
          {(practiceStatus === 'completed' || practiceStatus === 'abandoned') && <Button className="w-fit" variant="secondary" onClick={startPractice}>Luyện tập lại</Button>}
          {practiceStatus === 'saving' && <Spinner label="Đang lưu lịch sử" />}
          {practiceError && <FormNotice message={practiceError} />}
        </section>
      )}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Rời lượt luyện tập?"
          description="Lượt đang chạy sẽ được lưu là bỏ dở trước khi rời trang."
          confirmLabel="Lưu bỏ dở và rời trang"
          onConfirm={() => { void savePractice('abandoned').then((saved) => { if (saved) blocker.proceed() }) }}
          onClose={() => blocker.reset()}
          busy={practiceStatus === 'saving'}
        >{practiceError && <FormNotice message={practiceError} />}</ConfirmDialog>
      )}
    </div>
  )
}

export function SolverPage() {
  const navigate = useNavigate()
  const { session } = useSolveSession()
  if (!session) return (
    <div>
      <h1 className="text-title font-semibold text-ink">Lời giải</h1>
      <EmptyState title="Chưa có lời giải" description="Quét một khối Rubik để bắt đầu." action={<Button onClick={() => navigate('/quet')}>Quét khối Rubik</Button>} />
    </div>
  )
  return <SolverSession key={`${session.mode}-${session.result.solution_id}`} session={session} />
}
