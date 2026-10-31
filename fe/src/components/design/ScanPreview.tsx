import { useRef, useState } from 'react'
import { Button, CubeNet, StatusBadge } from '../ui'
import { demoCube } from './demoData'

export function ScanPreview() {
  const [denied, setDenied] = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <section className="grid gap-4" aria-label="Mẫu màn quét">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-section font-semibold">Quét</h3>
        <span className="text-small text-muted">Mặt B</span>
      </div>

      <div className="relative grid min-h-72 place-items-center overflow-hidden rounded-panel border border-control-border bg-quiet sm:min-h-96">
        {denied ? (
          <div className="grid max-w-xs justify-items-center gap-3 px-4 text-center">
            <StatusBadge tone="warning" label="Camera bị từ chối quyền" />
            <p className="text-small text-ink">
              Mở quyền camera trong cài đặt trình duyệt rồi tải lại trang, hoặc tải ảnh từ máy.
            </p>
            <Button variant="secondary" onClick={() => setDenied(false)}>Thử lại camera</Button>
          </div>
        ) : (
          <div className="relative grid size-52 grid-cols-3 grid-rows-3 border-2 border-control-border">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="border border-line" />
            ))}
            <span className="absolute inset-0 grid place-items-center text-center text-small font-medium text-ink">
              Đặt mặt B vào khung
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-3 border-b border-line pb-4">
        <p className="text-small text-muted">Tiến độ sáu mặt</p>
        <CubeNet faces={{ F: demoCube.F, R: demoCube.R }} size="overview" activeFace="B" />
      </div>

      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-control border border-control-border font-mono text-section text-ink">
          B
        </div>
        <p className="text-small text-ink">
          Giữ mặt U ở trên. Từ mặt R, xoay cả khối thêm 90° cùng chiều để mặt B hướng vào camera.
        </p>
      </div>

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png"
        aria-label="Chọn ảnh mặt B từ máy"
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled variant="primary">Chụp mặt B</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>Tải ảnh từ máy</Button>
      </div>
      {fileName && <p role="status" className="text-small text-muted">Đã chọn ảnh: {fileName}</p>}

      <Button variant="secondary" className="justify-self-start" onClick={() => setDenied((current) => !current)}>
        {denied ? 'Xem trạng thái camera' : 'Xem khi camera bị từ chối'}
      </Button>
    </section>
  )
}
