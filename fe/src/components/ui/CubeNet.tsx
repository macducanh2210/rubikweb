import type { CubePreviewFaces, Face } from '../../types'
import { Sticker } from './Sticker'

export interface CubeNetProps {
  faces: CubePreviewFaces
  size: 'overview' | 'editor'
  activeFace?: Face
  warningFaces?: readonly Face[]
  disabled?: boolean
  emptyStickerLabel?: string
  onFaceClick?: (face: Face) => void
  onStickerClick?: (face: Face, index: number) => void
}

const faceOrder: Face[] = ['U', 'L', 'F', 'R', 'B', 'D']
const facePosition: Record<Face, string> = {
  U: 'col-start-2 row-start-1',
  L: 'col-start-1 row-start-2',
  F: 'col-start-2 row-start-2',
  R: 'col-start-3 row-start-2',
  B: 'col-start-4 row-start-2',
  D: 'col-start-2 row-start-3',
}

function FaceGrid({ colors, face, size, emptyStickerLabel, onStickerClick }: {
  colors?: CubePreviewFaces[Face]
  face: Face
  size: 'overview' | 'editor'
  emptyStickerLabel: string
  onStickerClick?: (face: Face, index: number) => void
}) {
  return (
    <div className={`grid grid-cols-3 ${size === 'editor' ? 'gap-1' : 'aspect-square grid-rows-3 gap-px'}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <Sticker
          key={index}
          color={colors?.[index]}
          size={size}
          label={`Mặt ${face}, ô ${index + 1}: ${colors?.[index] ?? emptyStickerLabel}`}
          onClick={size === 'editor' && onStickerClick ? () => onStickerClick(face, index) : undefined}
        />
      ))}
    </div>
  )
}

/** Tổng quan luôn hiển thị đủ 6 mặt; editor phóng lớn mặt được chọn. */
export function CubeNet({ faces, size, activeFace = 'F', warningFaces = [], disabled = false, emptyStickerLabel = 'chưa chụp', onFaceClick, onStickerClick }: CubeNetProps) {
  if (size === 'editor') {
    return (
      <div className="inline-grid gap-3" aria-label={`Bộ sửa màu mặt ${activeFace}`}>
        <span className="text-small font-semibold text-ink">Mặt {activeFace}</span>
        <FaceGrid colors={faces[activeFace]} face={activeFace} size="editor" emptyStickerLabel={emptyStickerLabel} onStickerClick={onStickerClick} />
      </div>
    )
  }

  return (
    <div className="grid w-full max-w-90 grid-cols-4 grid-rows-3 gap-1" aria-label="Tổng quan sáu mặt khối Rubik">
      {faceOrder.map((face) => {
        const content = (
          <>
            <span className="flex items-center gap-1 text-caption font-semibold leading-none text-ink">
              {warningFaces.includes(face) && <span aria-label="Độ tin cậy thấp" className="size-2 rounded-full bg-warning" />}
              {face}
            </span>
            <FaceGrid colors={faces[face]} face={face} size="overview" emptyStickerLabel={emptyStickerLabel} />
          </>
        )
        const classes = `grid min-h-14 gap-1 rounded-sticker border p-1 ${facePosition[face]} ${warningFaces.includes(face) ? 'border-warning' : activeFace === face ? 'border-focus' : onFaceClick ? 'border-control-border' : 'border-line'} ${activeFace === face && onFaceClick ? 'outline-2 outline-offset-1 outline-focus' : ''}`
        return onFaceClick ? (
          <button
            key={face}
            type="button"
            disabled={disabled}
            className={classes}
            aria-label={`Chọn mặt ${face}`}
            aria-pressed={activeFace === face}
            onClick={() => onFaceClick(face)}
          >
            {content}
          </button>
        ) : <div key={face} className={classes}>{content}</div>
      })}
    </div>
  )
}
