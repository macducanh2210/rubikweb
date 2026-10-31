import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Cube3DErrorBoundary } from '../components/Cube3DErrorBoundary'
import { Button, ConfirmDialog, CubeNet, FormNotice, Spinner, Sticker, stickerLabels } from '../components/ui'
import { useSolveSession } from '../context/SolveSessionContext'
import { solutionMatchesState } from '../lib/cube'
import {
  createManualCubeDraft, manualColors, manualCubeStats, paintManualSticker, rotateManualFace, validateManualCube,
} from '../lib/cube/manualInput'
import { getApiError } from '../services/api'
import { detectionService } from '../services/detectionService'
import { solverService } from '../services/solverService'
import type { CubePreviewFaces, DetectFinalizeData, Face, StickerColor } from '../types'

const ScanRubikCube3D = lazy(() => import('../components/RubikCube3D').then((module) => ({ default: module.ScanRubikCube3D })))
const faceHints: Record<Face, string> = {
  U: 'Mặt trên: hàng trên giáp mặt B, hàng dưới giáp mặt F.',
  D: 'Mặt dưới: hàng trên giáp mặt F, hàng dưới giáp mặt B.',
  F: 'Mặt trước: hàng trên giáp U, cột trái giáp L.',
  R: 'Mặt phải: hàng trên giáp U, cột trái giáp F.',
  B: 'Mặt sau: hàng trên giáp U, cột trái giáp R.',
  L: 'Mặt trái: hàng trên giáp U, cột trái giáp B.',
}

function seededFaces(state: unknown): CubePreviewFaces | undefined {
  if (!state || typeof state !== 'object' || !('faces' in state)) return undefined
  return state.faces && typeof state.faces === 'object' ? state.faces as CubePreviewFaces : undefined
}

function manualError(error: unknown): string {
  const issue = getApiError(error)
  if (issue.kind === 'api' && issue.errorCode === 'UNSOLVABLE_STATE') {
    return `${issue.message} Kiểm tra màu và chiều của từng mặt. Có thể xoay lưới 90° nếu mặt nhập bị lệch chiều.`
  }
  return issue.message
}

export function ManualCubePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setSession } = useSolveSession()
  const [draft, setDraft] = useState(() => createManualCubeDraft(seededFaces(location.state)))
  const [activeFace, setActiveFace] = useState<Face>('F')
  const [selectedColor, setSelectedColor] = useState<StickerColor>('white')
  const [notice, setNotice] = useState('')
  const [processing, setProcessing] = useState<'checking' | 'solving' | null>(null)
  const [finalized, setFinalized] = useState<DetectFinalizeData | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [webglFailed, setWebglFailed] = useState(false)
  const mounted = useRef(false)
  const { counts, missingCount, distinctCenters } = manualCubeStats(draft)
  const busy = processing !== null

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  function paintSticker(face: Face, index: number) {
    if (busy) return
    setDraft((current) => paintManualSticker(current, face, index, selectedColor))
    setNotice('')
    setFinalized(null)
  }

  function rotateFace() {
    setDraft((current) => rotateManualFace(current, activeFace))
    setNotice('')
    setFinalized(null)
  }

  function resetDraft() {
    setDraft(createManualCubeDraft())
    setNotice('')
    setFinalized(null)
    setResetOpen(false)
  }

  async function startSolving() {
    if (busy) return
    const checked = validateManualCube(draft)
    if (!checked.cubeState) {
      setNotice(checked.error ?? 'Kiểm tra lại màu của sáu mặt.')
      return
    }
    setNotice('')
    setProcessing(finalized ? 'solving' : 'checking')
    try {
      const result = finalized ?? await detectionService.createManual({ cube_state: checked.cubeState })
      if (!mounted.current) return
      setFinalized(result)
      setProcessing('solving')
      const solution = await solverService.solve({ rubik_state_id: result.rubik_state_id })
      if (!mounted.current) return
      if (!solutionMatchesState(result.cube_state, solution.moves)) {
        console.error('Lời giải không khớp với trạng thái khối nhập màu', {
          rubik_state_id: result.rubik_state_id,
          cube_state: result.cube_state,
          solution_id: solution.solution_id,
          moves: solution.moves,
          total_steps: solution.total_steps,
        })
        setNotice('Lời giải không khớp với trạng thái khối. Hãy kiểm tra lại màu đã nhập.')
        return
      }
      setSession({ mode: 'live', source: 'manual', rubikStateId: result.rubik_state_id, cubeState: result.cube_state, confidenceScore: result.confidence_score, result: solution })
      navigate('/loi-giai')
    } catch (error) {
      if (mounted.current) setNotice(manualError(error))
    } finally {
      if (mounted.current) setProcessing(null)
    }
  }

  const fallback = <p role="alert" className="text-small text-muted">Không hiển thị được khối 3D. Xem màu trong net sáu mặt.</p>

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-title font-semibold text-ink">Nhập màu khối</h1>
        <p className="max-w-2xl text-small text-muted">Tô màu giống khối thật của bạn để lấy lời giải. Chọn một mặt trong net, chọn màu rồi chạm từng ô lớn.</p>
        <Link to="/quet" className="inline-flex min-h-11 w-fit items-center text-small text-link">Về trang quét</Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid min-w-0 content-start gap-4" aria-label="Tổng quan khối nhập màu">
          <CubeNet faces={draft} size="overview" activeFace={activeFace} onFaceClick={setActiveFace} disabled={busy} emptyStickerLabel="chưa tô" />
          <div className="grid gap-2">
            <h2 className="text-small font-semibold text-ink">Mô hình 3D</h2>
            <p className="text-small text-muted">Ô chưa tô có màu xám. Kéo khối để xem các mặt.</p>
            {webglFailed ? fallback : (
              <Cube3DErrorBoundary fallback={fallback} onError={() => setWebglFailed(true)}>
                <Suspense fallback={<div className="grid h-64 place-items-center sm:h-72"><Spinner label="Đang mở khối 3D" /></div>}>
                  <div className="h-64 min-w-0 w-full sm:h-72">
                    <ScanRubikCube3D faces={draft} ariaLabel="Khối Rubik với các màu đang nhập" onWebGLError={() => setWebglFailed(true)} />
                  </div>
                </Suspense>
              </Cube3DErrorBoundary>
            )}
          </div>
        </section>

        <section className="grid content-start justify-items-start gap-4" aria-label={`Tô màu mặt ${activeFace}`}>
          <div className="grid max-w-lg gap-1">
            <h2 className="text-section font-semibold text-ink">Tô màu mặt {activeFace}</h2>
            <p className="text-small text-muted">{faceHints[activeFace]}</p>
          </div>
          <div className="grid gap-2">
            <p className="text-small text-muted">Màu đang chọn: {stickerLabels[selectedColor].toLowerCase()}</p>
            <div className="flex flex-wrap gap-3" role="group" aria-label="Chọn màu để tô">
              {manualColors.map((color) => (
                <Sticker key={color} color={color} size="swatch" selected={selectedColor === color} label={`Chọn màu ${stickerLabels[color]}`} onClick={busy ? undefined : () => setSelectedColor(color)} />
              ))}
            </div>
          </div>
          <CubeNet faces={draft} size="editor" activeFace={activeFace} onStickerClick={busy ? undefined : paintSticker} emptyStickerLabel="chưa tô" />
          <p className="max-w-lg text-caption text-muted">Màu tâm là gợi ý ban đầu. Nếu tâm trên khối thật khác, chạm ô giữa để sửa. Giữ cùng tư thế với net khi nhập các mặt.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={rotateFace}>Xoay lưới 90°</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setResetOpen(true)}>Xóa màu đã nhập</Button>
          </div>
        </section>
      </div>

      <section className="grid gap-3 border-t border-line pt-4" aria-label="Kiểm tra số lượng màu">
        <p className="text-small text-ink" aria-live="polite">{missingCount > 0 ? `Đã tô ${54 - missingCount}/54 ô. Còn ${missingCount} ô.` : 'Đã tô đủ 54 ô. Máy chủ sẽ kiểm tra khối trước khi tìm lời giải.'}</p>
        <dl className="grid max-w-2xl grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {manualColors.map((color) => (
            <div key={color} className="flex items-center justify-between gap-2 text-small">
              <dt className="inline-flex items-center gap-2"><span className="size-4 shrink-0"><Sticker color={color} label={stickerLabels[color]} /></span>{stickerLabels[color]}</dt>
              <dd className={`font-mono ${counts[color] > 9 || (missingCount === 0 && counts[color] !== 9) ? 'text-danger-text' : 'text-ink'}`}>{counts[color]}/9</dd>
            </div>
          ))}
        </dl>
        {!distinctCenters && <FormNotice message="Sáu ô tâm cần có sáu màu khác nhau. Chọn từng mặt để sửa ô giữa." />}
      </section>

      {notice && <FormNotice message={notice} />}
      <Button className="w-full sm:w-fit" loading={busy} onClick={startSolving}>{processing === 'checking' ? 'Đang kiểm tra màu...' : processing === 'solving' ? 'Đang tìm lời giải...' : 'Lấy lời giải'}</Button>
      {resetOpen && <ConfirmDialog title="Xóa màu đã nhập?" description="Các ô đã tô sẽ được xóa. Sáu ô tâm trở về màu gợi ý ban đầu." confirmLabel="Xóa màu đã nhập" onConfirm={resetDraft} onClose={() => setResetOpen(false)} />}
    </div>
  )
}
