import { useState } from 'react'
import { Button, CubeNet, StatusBadge, Sticker, stickerLabels } from '../ui'
import type { CubeState, Face, FaceColors, StickerColor } from '../../types'
import { demoCube } from './demoData'

const palette: StickerColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']
const captureFaces: Face[] = ['F', 'R', 'B', 'L', 'U', 'D']

function rotateFaceClockwise(colors: FaceColors): FaceColors {
  return [colors[6], colors[3], colors[0], colors[7], colors[4], colors[1], colors[8], colors[5], colors[2]]
}

export function ResultEditorPreview({ onStartSolve }: { onStartSolve?: () => void }) {
  const [faces, setFaces] = useState<Partial<CubeState>>(demoCube)
  const [activeFace, setActiveFace] = useState<Face>('F')
  const [selectedColor, setSelectedColor] = useState<StickerColor>('green')
  const [notice, setNotice] = useState('')
  const complete = captureFaces.every((face) => Boolean(faces[face]))

  function changeSticker(face: Face, index: number) {
    const colors = faces[face]
    if (!colors) return
    const changed = [...colors] as FaceColors
    changed[index] = selectedColor
    setFaces((current) => ({ ...current, [face]: changed }))
    setNotice(`Đã đổi màu ô ${index + 1} của mặt ${face}`)
  }

  function rotateSelectedFace() {
    const colors = faces[activeFace]
    if (!colors) return
    setFaces((current) => ({ ...current, [activeFace]: rotateFaceClockwise(colors) }))
    setNotice(`Đã xoay lưới mặt ${activeFace} 90°`)
  }

  function restoreSelectedFace() {
    setFaces((current) => ({ ...current, [activeFace]: demoCube[activeFace] }))
    setNotice(`Đã khôi phục màu gốc mặt ${activeFace}`)
  }

  function recaptureSelectedFace() {
    setFaces((current) => ({ ...current, [activeFace]: undefined }))
    setNotice(`Mặt ${activeFace} cần chụp lại`)
  }

  return (
    <section className="grid gap-5" aria-label="Mẫu kết quả nhận diện">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-section font-semibold">Kết quả nhận diện</h3>
        <StatusBadge tone="success" label="Độ tin cậy 94%" />
      </div>
      <div className="grid justify-items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid w-full gap-2">
          <p className="text-small text-muted">Chọn một mặt trong net để sửa màu.</p>
          <CubeNet faces={faces} size="overview" activeFace={activeFace} onFaceClick={setActiveFace} />
        </div>
        <div className="grid justify-items-start gap-4">
          <CubeNet faces={faces} size="editor" activeFace={activeFace} onStickerClick={changeSticker} />
          <div className="flex flex-wrap gap-3" role="group" aria-label="Chọn màu cho ô">
            {palette.map((color) => (
              <Sticker
                key={color}
                color={color}
                size="swatch"
                label={`Chọn màu ${stickerLabels[color]}`}
                selected={selectedColor === color}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={rotateSelectedFace}>Xoay lưới 90°</Button>
        <Button variant="secondary" onClick={restoreSelectedFace}>Khôi phục màu gốc</Button>
        <Button variant="secondary" onClick={recaptureSelectedFace}>Chụp lại mặt {activeFace}</Button>
      </div>
      {notice && <p role="status" className="text-small text-muted">{notice}</p>}
      <Button className="w-full sm:w-auto" disabled={!complete || !onStartSolve} onClick={onStartSolve}>
        Bắt đầu giải
      </Button>
    </section>
  )
}
