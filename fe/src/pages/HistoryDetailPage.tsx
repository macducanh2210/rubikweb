import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, CubeNet, EmptyState, FormNotice, MoveChip, Spinner, StatRow, StatusBadge } from '../components/ui'
import { useSolveSession } from '../context/SolveSessionContext'
import { formatDateTime, formatDuration } from '../lib/formatDate'
import { getApiError } from '../services/api'
import { historyService } from '../services/historyService'
import type { Face, HistoryDetail } from '../types'

const faces: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const faceNames: Record<Face, string> = {
  U: 'trên', D: 'dưới', F: 'trước', B: 'sau', L: 'trái', R: 'phải',
}

function DetailContent({ detail }: { detail: HistoryDetail }) {
  const navigate = useNavigate()
  const { openReplayFromDetail } = useSolveSession()
  const images = faces.flatMap((face) => detail.rubik_state.face_images[face]
    ? [{ face, url: detail.rubik_state.face_images[face] }]
    : [])

  function startReplay() {
    openReplayFromDetail(detail)
    navigate('/loi-giai')
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-x-8 sm:grid-cols-2">
        <StatRow label="Bắt đầu" value={formatDateTime(detail.start_time)} />
        <StatRow label="Kết thúc" value={formatDateTime(detail.end_time)} />
        <StatRow label="Thời gian" value={formatDuration(detail.duration)} />
        <StatRow label="Số bước" value={detail.solution.total_steps} />
      </div>
      <section aria-labelledby="cube-state-title" className="grid gap-3">
        <h2 id="cube-state-title" className="text-section font-semibold">Trạng thái ban đầu</h2>
        <CubeNet faces={detail.rubik_state.cube_state} size="overview" />
      </section>
      <section aria-labelledby="moves-title" className="grid gap-3">
        <h2 id="moves-title" className="text-section font-semibold">Các bước giải</h2>
        {detail.solution.moves.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Danh sách ký hiệu lời giải">
            {detail.solution.moves.map((move, index) => <MoveChip key={index} move={move} step={index + 1} />)}
          </div>
        ) : <p className="text-small text-muted">Khối đã được giải sẵn, không cần bước xoay.</p>}
      </section>
      {images.length > 0 && (
        <section aria-labelledby="face-images-title" className="grid gap-3">
          <h2 id="face-images-title" className="text-section font-semibold">Ảnh sáu mặt</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {images.map(({ face, url }) => (
              <figure key={face} className="grid gap-2">
                <img src={url} alt={`Ảnh mặt ${faceNames[face]} (${face})`} loading="lazy" className="aspect-square w-full rounded-sticker border border-line object-cover" />
                <figcaption className="text-small text-muted">Mặt {faceNames[face]} ({face})</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      <Button className="justify-self-start" onClick={startReplay}>Xem lại lời giải 3D</Button>
    </div>
  )
}

export function HistoryDetailPage() {
  const { id } = useParams()
  const historyId = Number(id)
  const validId = Number.isSafeInteger(historyId) && historyId > 0
  const [detail, setDetail] = useState<HistoryDetail | null>(null)
  const [loading, setLoading] = useState(validId)
  const [notFound, setNotFound] = useState(!validId)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!validId) {
      setDetail(null)
      setNotFound(true)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    setNotFound(false)
    setDetail(null)
    historyService.getDetail(historyId).then((data) => {
      if (active) setDetail(data)
    }).catch((cause: unknown) => {
      if (!active) return
      const apiError = getApiError(cause)
      if (apiError.kind === 'api' && apiError.errorCode === 'HISTORY_NOT_FOUND') {
        setNotFound(true)
      } else {
        setError(apiError.message)
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [historyId, validId, reloadKey])

  if (notFound && !loading) {
    return <EmptyState title="Không tìm thấy lượt giải" description="Lượt giải này không tồn tại hoặc đã bị xóa." action={<Link className="text-link underline" to="/lich-su">Về Lịch sử</Link>} />
  }

  return (
    <div className="grid gap-6">
      <Link to="/lich-su" className="w-fit text-small text-link underline">Về Lịch sử</Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-title font-semibold">Chi tiết lượt giải</h1>
        {!loading && detail && <StatusBadge label={detail.status === 'completed' ? 'Hoàn thành' : 'Bỏ dở'} tone={detail.status === 'completed' ? 'success' : 'warning'} />}
      </div>
      {loading && <div role="status" className="flex items-center gap-3"><Spinner />Đang tải lượt giải…</div>}
      {!loading && error && <div className="grid gap-3"><FormNotice message={error} /><Button variant="secondary" className="justify-self-start" onClick={() => setReloadKey((value) => value + 1)}>Thử lại</Button></div>}
      {!loading && !error && detail && <DetailContent detail={detail} />}
    </div>
  )
}
