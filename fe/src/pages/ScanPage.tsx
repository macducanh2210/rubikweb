import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaptureGuide, faceGuides } from '../components/CaptureGuide'
import { Cube3DErrorBoundary } from '../components/Cube3DErrorBoundary'
import { Button, CubeNet, FormNotice, Spinner, StatusBadge, Sticker, stickerLabels } from '../components/ui'
import { useSolveSession } from '../context/SolveSessionContext'
import { solutionMatchesState } from '../lib/cube'
import { rotateFaceClockwise } from '../lib/cubeEditing'
import { captureOrder, nextUncapturedFace } from '../lib/scanCapture'
import { getApiError } from '../services/api'
import { detectionService } from '../services/detectionService'
import { settingsService } from '../services/settingsService'
import { solverService } from '../services/solverService'
import type { CameraConfig, CubeState, DetectFinalizeData, DetectSingleFaceData, Face, FaceColors, StickerColor } from '../types'

type CameraState = 'idle' | 'starting' | 'active' | 'denied' | 'unavailable'
type Processing = 'detecting' | 'finalizing' | 'solving' | null
type Notice = { message: string; tone: 'error' | 'warning' }

interface CapturedFace extends DetectSingleFaceData {
  originalColors: FaceColors
  currentColors: FaceColors
  edited: boolean
}

const palette: StickerColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']
const requestOrder: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const maxImageSize = 5 * 1024 * 1024
const resolutionSize = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const
const ScanRubikCube3D = lazy(() => import('../components/RubikCube3D').then((module) => ({ default: module.ScanRubikCube3D })))

function ScanCubePreview({ faces }: { faces: Partial<CubeState> }) {
  const [webglFailed, setWebglFailed] = useState(false)
  const fallback = <p role="alert" className="text-small text-muted">Không hiển thị được khối 3D. Xem màu các mặt trong net sáu mặt.</p>
  return (
    <section aria-label="Mô hình khối đã quét" className="grid min-w-0 content-start gap-2">
      <h2 className="text-small font-semibold text-ink">Mô hình 3D</h2>
      <p className="text-small text-muted">{requestOrder.every((face) => faces[face])
        ? 'Kéo khối để đổi góc nhìn. Màu thay đổi khi sửa ô.'
        : 'Mặt chưa quét có màu xám. Kéo khối để đổi góc nhìn.'}</p>
      {webglFailed ? fallback : (
        <Cube3DErrorBoundary fallback={fallback} onError={() => setWebglFailed(true)}>
          <Suspense fallback={<div className="grid h-64 place-items-center sm:h-72"><Spinner label="Đang mở khối 3D" /></div>}>
            <div className="h-64 min-w-0 w-full sm:h-72">
              <ScanRubikCube3D faces={faces} onWebGLError={() => setWebglFailed(true)} />
            </div>
          </Suspense>
        </Cube3DErrorBoundary>
      )}
    </section>
  )
}

function detectionError(error: unknown): Notice {
  const issue = getApiError(error)
  if (issue.kind !== 'api') return { message: issue.message, tone: 'error' }
  if (issue.errorCode === 'LOW_CONFIDENCE') {
    const score = issue.details?.confidence_score
    const confidence = typeof score === 'number' ? ` (${Math.round(score * 100)}%)` : ''
    return { message: `${issue.message}${confidence} Đặt mặt khối vào giữa khung, đủ sáng rồi chụp lại.`, tone: 'warning' }
  }
  if (issue.errorCode === 'CUBE_NOT_DETECTED') {
    return { message: `${issue.message} Đặt trọn mặt khối vào khung rồi chụp lại.`, tone: 'error' }
  }
  return { message: issue.message, tone: 'error' }
}

function finalizationError(error: unknown): string {
  const issue = getApiError(error)
  if (issue.kind !== 'api') return issue.message
  if (issue.errorCode === 'INVALID_CUBE_STATE') {
    const counts = issue.details?.invalid_colors
    if (counts && typeof counts === 'object' && !Array.isArray(counts)) {
      const summary = Object.entries(counts).flatMap(([color, count]) => {
        if (typeof count !== 'number') return []
        const name = color in stickerLabels ? stickerLabels[color as StickerColor].toLowerCase() : color
        const difference = count - 9
        return difference === 0 ? [] : [`màu ${name} ${difference > 0 ? `thừa ${difference}` : `thiếu ${-difference}`} ô`]
      })
      if (summary.length) return `${issue.message} ${summary.join('; ')}. Chọn mặt trong net để sửa màu.`
    }
  }
  if (issue.errorCode === 'UNSOLVABLE_STATE') {
    return `${issue.message} Kiểm tra ô nhận sai và chiều của từng mặt; dùng “Xoay lưới 90°” nếu ảnh bị lệch chiều.`
  }
  return issue.message
}

function NoticeBlock({ notice }: { notice: Notice }) {
  return notice.tone === 'warning'
    ? <div role="alert" className="grid gap-1"><StatusBadge tone="warning" label="Cần chụp lại" /><p className="text-small text-ink">{notice.message}</p></div>
    : <FormNotice message={notice.message} />
}

export function ScanPage() {
  const navigate = useNavigate()
  const { setSession } = useSolveSession()
  const [stage, setStage] = useState<'capture' | 'review'>('capture')
  const [captureFace, setCaptureFace] = useState<Face>('F')
  const [recapturing, setRecapturing] = useState(false)
  const [fromStandardPose, setFromStandardPose] = useState(false)
  const [captures, setCaptures] = useState<Partial<Record<Face, CapturedFace>>>({})
  const [activeFace, setActiveFace] = useState<Face>('F')
  const [selectedColor, setSelectedColor] = useState<StickerColor>('white')
  const [cameraConfig, setCameraConfig] = useState<CameraConfig | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [processing, setProcessing] = useState<Processing>(null)
  const [finalized, setFinalized] = useState<DetectFinalizeData | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const captureAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraRequestRef = useRef(0)
  const capturePendingRef = useRef(false)
  const imageRequestRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cameraRequestRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    settingsService.getSettings()
      .then((settings) => { if (!cancelled) { setCameraConfig(settings.camera_config); setSettingsError('') } })
      .catch((error: unknown) => { if (!cancelled) setSettingsError(getApiError(error).message) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream, preview, stage])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function stopCamera() {
    cameraRequestRef.current += 1
    capturePendingRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setCameraState('idle')
  }

  async function enableCamera() {
    if (!cameraConfig) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    const requestId = ++cameraRequestRef.current
    const { width, height } = resolutionSize[cameraConfig.resolution]
    setCameraState('starting')
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: width }, height: { ideal: height } },
      })
      if (!mountedRef.current || requestId !== cameraRequestRef.current) {
        nextStream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = nextStream
      setStream(nextStream)
      setCameraState('active')
      setNotice(null)
      clearSelectedImage()
    } catch (error) {
      if (!mountedRef.current || requestId !== cameraRequestRef.current) return
      setCameraState(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') ? 'denied' : 'unavailable')
    }
  }

  function clearSelectedImage() {
    imageRequestRef.current += 1
    capturePendingRef.current = false
    setSelectedFile(null)
    setPreview(null)
  }

  function setImage(file: File) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      clearSelectedImage()
      setNotice({ message: 'Chỉ chọn ảnh JPG hoặc PNG.', tone: 'error' })
      return
    }
    if (file.size > maxImageSize) {
      clearSelectedImage()
      setNotice({ message: 'Ảnh vượt quá 5 MB. Chọn ảnh nhỏ hơn.', tone: 'error' })
      return
    }
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
    setNotice(null)
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      stopCamera()
      setImage(file)
    }
  }

  function captureFromCamera() {
    if (capturePendingRef.current) return
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setNotice({ message: 'Camera chưa sẵn sàng. Đợi hình hiện rõ rồi chụp lại.', tone: 'error' })
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setNotice({ message: 'Không thể lấy ảnh từ camera. Hãy tải ảnh từ máy.', tone: 'error' })
      return
    }
    // Giữ nguyên trái/phải của video gốc; ảnh gửi backend không lật gương.
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const requestId = cameraRequestRef.current
    const imageRequestId = ++imageRequestRef.current
    capturePendingRef.current = true
    canvas.toBlob((blob) => {
      if (!mountedRef.current || requestId !== cameraRequestRef.current || imageRequestId !== imageRequestRef.current) return
      capturePendingRef.current = false
      if (!blob) {
        setNotice({ message: 'Không thể tạo ảnh JPEG. Hãy chụp lại hoặc tải ảnh từ máy.', tone: 'error' })
        return
      }
      setImage(new File([blob], `mat-${captureFace}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  async function detectCurrentFace() {
    if (!selectedFile || processing) return
    setProcessing('detecting')
    setNotice(null)
    try {
      const data = await detectionService.detectFace({ face: captureFace, image: selectedFile })
      if (data.face !== captureFace) {
        setNotice({ message: `Máy chủ trả về mặt ${data.face} thay vì ${captureFace}. Hãy thử lại.`, tone: 'error' })
        return
      }
      const nextCaptures = {
        ...captures,
        [captureFace]: { ...data, originalColors: data.colors, currentColors: data.colors, edited: false },
      }
      setCaptures(nextCaptures)
      setFinalized(null)
      clearSelectedImage()
      const nextFace = nextUncapturedFace(nextCaptures)
      if (recapturing || !nextFace) {
        setStage('review')
        setActiveFace(captureFace)
        setRecapturing(false)
        stopCamera()
      } else {
        setCaptureFace(nextFace)
      }
    } catch (error) {
      setNotice(detectionError(error))
    } finally {
      setProcessing(null)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== ' ' && event.key !== 'Spacebar') return
      if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (stage !== 'capture' || processing) return
      if (document.querySelector('dialog[open], [role="dialog"]')) return
      const target = event.target
      if (target instanceof Element && target.closest('button, a, summary, input, textarea, select, [contenteditable], [role="button"], [role="textbox"]')) return
      if (preview && selectedFile) {
        event.preventDefault()
        void detectCurrentFace()
      } else if (cameraState === 'active' && !preview && videoRef.current?.videoWidth && videoRef.current.videoHeight) {
        event.preventDefault()
        captureFromCamera()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stage, cameraState, preview, selectedFile, processing, captureFace, recapturing])

  function editSticker(face: Face, index: number) {
    if (processing) return
    setCaptures((current) => {
      const captured = current[face]
      if (!captured) return current
      const colors = [...captured.currentColors] as FaceColors
      colors[index] = selectedColor
      return { ...current, [face]: { ...captured, currentColors: colors, edited: true } }
    })
    setFinalized(null)
    setNotice(null)
  }

  function rotateSelectedFace() {
    setCaptures((current) => {
      const captured = current[activeFace]
      if (!captured) return current
      return { ...current, [activeFace]: { ...captured, currentColors: rotateFaceClockwise(captured.currentColors), edited: true } }
    })
    setFinalized(null)
    setNotice(null)
  }

  function restoreSelectedFace() {
    setCaptures((current) => {
      const captured = current[activeFace]
      if (!captured) return current
      return { ...current, [activeFace]: { ...captured, currentColors: captured.originalColors, edited: false } }
    })
    setFinalized(null)
    setNotice(null)
  }

  function recaptureSelectedFace() {
    clearSelectedImage()
    setNotice(null)
    setFinalized(null)
    setCaptureFace(activeFace)
    setFromStandardPose(true)
    setRecapturing(true)
    setStage('capture')
  }

  function selectCaptureFace(face: Face) {
    if (processing || face === captureFace) return
    clearSelectedImage()
    setNotice(null)
    setCaptureFace(face)
    setFromStandardPose(true)
    captureAreaRef.current?.focus()
  }

  async function startSolving() {
    if (processing) return
    if (!requestOrder.every((face) => captures[face])) {
      setNotice({ message: 'Cần nhận diện đủ sáu mặt trước khi bắt đầu giải.', tone: 'error' })
      return
    }
    setNotice(null)
    let phase: 'finalizing' | 'solving' = 'finalizing'
    try {
      let result = finalized
      if (!result) {
        setProcessing('finalizing')
        result = await detectionService.finalize({
          faces: requestOrder.map((face) => {
            const captured = captures[face]!
            return { face, face_id: captured.face_id, colors: captured.edited ? captured.currentColors : null }
          }),
        })
        setFinalized(result)
      }
      phase = 'solving'
      setProcessing('solving')
      const solution = await solverService.solve({ rubik_state_id: result.rubik_state_id })
      if (!solutionMatchesState(result.cube_state, solution.moves)) {
        console.error('Lời giải không khớp với trạng thái khối', {
          rubik_state_id: result.rubik_state_id,
          cube_state: result.cube_state,
          solution_id: solution.solution_id,
          moves: solution.moves,
          total_steps: solution.total_steps,
        })
        setNotice({ message: 'Lời giải không khớp với trạng thái khối. Hãy quét lại.', tone: 'error' })
        return
      }
      setSession({ mode: 'live', rubikStateId: result.rubik_state_id, cubeState: result.cube_state, confidenceScore: result.confidence_score, result: solution })
      navigate('/loi-giai')
    } catch (error) {
      const issue = getApiError(error)
      setNotice({
        message: phase === 'finalizing' ? finalizationError(error)
          : issue.kind === 'api' && issue.errorCode === 'UNSOLVABLE_STATE'
            ? `${issue.message} Kiểm tra ô màu hoặc xoay lưới từng mặt rồi thử lại.`
            : issue.message,
        tone: 'error',
      })
    } finally {
      setProcessing(null)
    }
  }

  const netFaces = Object.fromEntries(Object.entries(captures).map(([face, data]) => [face, data?.currentColors])) as Partial<CubeState>
  const warningFaces = captureOrder.filter((face) => (captures[face]?.confidence_score ?? 1) < 0.85)
  const current = captures[activeFace]
  const busy = processing !== null

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <p className="text-small text-muted">Không có camera hoặc muốn nhập màu trực tiếp?</p>
        <Button variant="secondary" disabled={busy} onClick={() => { stopCamera(); navigate('/nhap-mau', { state: { faces: netFaces } }) }}>Nhập màu bằng tay</Button>
      </div>
      {stage === 'capture' ? (
        <>
          <div className="grid gap-2">
            <h1 className="text-title font-semibold text-ink">Quét</h1>
            <p className="text-small text-muted">{recapturing || captures[captureFace] ? `Chụp lại mặt ${captureFace}` : faceGuides[captureFace].title}</p>
          </div>
          <CaptureGuide face={captureFace} fromStandardPose={fromStandardPose} />
          <div ref={captureAreaRef} tabIndex={-1} className="relative grid min-h-72 place-items-center overflow-hidden rounded-panel border border-control-border bg-quiet sm:min-h-112">
            {preview ? <img src={preview} alt={`Ảnh mặt ${captureFace} đã chọn`} className="absolute inset-0 size-full object-contain" />
              : stream ? <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 size-full object-contain" /> : null}
            {cameraState === 'active' && !preview && (
              <div aria-hidden="true" className="pointer-events-none relative grid aspect-square w-52 grid-cols-3 grid-rows-3 border-2 border-on-action sm:w-64">
                {Array.from({ length: 9 }, (_, index) => <span key={index} className="border border-on-action" />)}
              </div>
            )}
            {!preview && cameraState === 'idle' && (
              <div className="grid justify-items-center gap-3 px-4 text-center">
                <p className="text-body text-ink">Đặt trọn mặt {captureFace} vào khung.</p>
                <Button onClick={enableCamera} disabled={!cameraConfig}>Bật camera</Button>
                {!cameraConfig && !settingsError && <Spinner label="Đang đọc cài đặt camera" />}
              </div>
            )}
            {!preview && cameraState === 'starting' && (
              <div className="grid justify-items-center gap-2 px-4 text-center">
                <Spinner label="Đang mở camera" />
                <p className="text-small text-ink">Đang mở camera. Hãy cấp quyền khi trình duyệt hỏi.</p>
                <Button variant="secondary" onClick={stopCamera}>Hủy mở camera</Button>
              </div>
            )}
            {!preview && (cameraState === 'denied' || cameraState === 'unavailable') && (
              <div className="grid max-w-sm justify-items-center gap-3 px-4 text-center">
                <StatusBadge tone="warning" label={cameraState === 'denied' ? 'Camera bị từ chối quyền' : 'Không mở được camera'} />
                <p className="text-small text-ink">{cameraState === 'denied'
                  ? 'Cấp quyền camera trong cài đặt trình duyệt rồi thử lại, hoặc tải ảnh từ máy.'
                  : 'Kiểm tra camera và trình duyệt, hoặc tải ảnh từ máy.'}</p>
                <Button variant="secondary" onClick={enableCamera}>Thử lại camera</Button>
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>Tải ảnh từ máy</Button>
              </div>
            )}
          </div>
          {settingsError && <FormNotice message={`Không tải được cài đặt camera: ${settingsError} Bạn vẫn có thể tải ảnh từ máy.`} />}
          {notice && <NoticeBlock notice={notice} />}
          <div className="flex flex-wrap gap-2">
            {cameraState === 'active' && !preview && <Button onClick={captureFromCamera} aria-keyshortcuts="Space" disabled={busy}>Chụp mặt {captureFace}</Button>}
            {cameraState === 'active' && !preview && <Button variant="secondary" onClick={stopCamera}>Tắt camera</Button>}
            {preview && <Button onClick={detectCurrentFace} aria-keyshortcuts="Space" loading={processing === 'detecting'} disabled={busy && processing !== 'detecting'}>Nhận diện mặt {captureFace}</Button>}
            {preview && cameraState === 'active' && <Button variant="secondary" onClick={clearSelectedImage} disabled={busy}>Chụp lại mặt {captureFace}</Button>}
            {cameraState !== 'denied' && cameraState !== 'unavailable' && <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>Tải ảnh từ máy</Button>}
            {recapturing && <Button variant="secondary" onClick={() => { clearSelectedImage(); stopCamera(); setStage('review'); setRecapturing(false); setNotice(null) }} disabled={busy}>Về kết quả</Button>}
          </div>
          {((cameraState === 'active' && !preview) || preview) && (
            <p className="text-small text-muted">{preview ? 'Nhấn Space để nhận diện ảnh.' : 'Nhấn Space để chụp ảnh.'}</p>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label={`Tải ảnh mặt ${captureFace} từ máy`} onChange={chooseFile} />
          <div className="grid gap-6 md:grid-cols-2">
            <section className="grid content-start gap-2" aria-label="Tiến độ sáu mặt">
              <h2 className="text-small font-semibold text-ink">Các mặt đã nhận diện</h2>
              <CubeNet faces={netFaces} size="overview" activeFace={captureFace} warningFaces={warningFaces} onFaceClick={selectCaptureFace} disabled={busy} />
              <p className="text-caption text-muted">Bấm một mặt để chọn chụp. Tự động tiếp tục mặt còn thiếu theo thứ tự F, R, B, L, U, D; viền xanh là mặt hiện tại.</p>
            </section>
            <ScanCubePreview faces={netFaces} />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            <h1 className="text-title font-semibold text-ink">Kết quả nhận diện</h1>
            <p className="text-small text-muted">Chọn một mặt trong net, rồi chạm ô lớn để sửa màu.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="grid content-start gap-3" aria-label="Tổng quan sáu mặt">
              <CubeNet faces={netFaces} size="overview" activeFace={activeFace} warningFaces={warningFaces} onFaceClick={setActiveFace} />
              {warningFaces.length > 0 && <StatusBadge tone="warning" label={`Cần kiểm tra độ tin cậy: ${warningFaces.join(', ')}`} />}
              <ScanCubePreview faces={netFaces} />
            </section>
            <section className="grid content-start justify-items-start gap-4" aria-label={`Sửa màu mặt ${activeFace}`}>
              <div className="grid gap-1">
                <h2 className="text-section font-semibold text-ink">Mặt {activeFace}</h2>
                {current && (current.confidence_score < 0.85
                  ? <StatusBadge tone="warning" label={`Độ tin cậy ${Math.round(current.confidence_score * 100)}%. Kiểm tra lại màu.`} />
                  : <p className="text-small text-muted">Độ tin cậy {Math.round(current.confidence_score * 100)}%</p>)}
              </div>
              <CubeNet faces={netFaces} size="editor" activeFace={activeFace} onStickerClick={busy ? undefined : editSticker} />
              <div className="grid gap-2">
                <p className="text-small text-muted">Màu dùng để sửa ô</p>
                <div className="flex flex-wrap gap-3" role="group" aria-label="Chọn màu cho ô">
                  {palette.map((color) => <Sticker key={color} color={color} size="swatch" label={`Chọn màu ${stickerLabels[color]}`} selected={selectedColor === color} onClick={busy ? undefined : () => setSelectedColor(color)} />)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={rotateSelectedFace} disabled={busy}>Xoay lưới 90°</Button>
                <Button variant="secondary" onClick={restoreSelectedFace} disabled={busy || !current?.edited}>Khôi phục màu gốc</Button>
                <Button variant="secondary" onClick={recaptureSelectedFace} disabled={busy}>Chụp lại mặt {activeFace}</Button>
              </div>
            </section>
          </div>
          {notice && <NoticeBlock notice={notice} />}
          {busy && <p role="status" className="inline-flex items-center gap-2 text-small text-ink"><Spinner label="Đang xử lý" />{processing === 'finalizing' ? 'Đang kiểm tra sáu mặt...' : 'Đang tìm lời giải...'}</p>}
          <Button className="w-full sm:w-fit" onClick={startSolving} disabled={busy} loading={busy}>Bắt đầu giải</Button>
        </>
      )}
    </div>
  )
}
