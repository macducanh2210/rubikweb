import type { Face } from '../types'

interface FaceGuide {
  title: string
  instruction: string
  top: Face
  bottom: Face
  left: Face
  right: Face
  motion: string
}

export const faceGuides: Record<Face, FaceGuide> = {
  F: {
    title: 'Mặt trước F',
    instruction: 'Giữ U ở trên, F hướng vào camera và R ở bên phải.',
    top: 'U', bottom: 'D', left: 'L', right: 'R', motion: 'Tư thế chuẩn',
  },
  R: {
    title: 'Mặt phải R',
    instruction: 'Giữ U ở trên. Xoay cả khối 90° quanh trục đứng để R hướng vào camera.',
    top: 'U', bottom: 'D', left: 'F', right: 'B', motion: 'Xoay ngang 90°',
  },
  B: {
    title: 'Mặt sau B',
    instruction: 'Từ mặt R, xoay thêm 90° cùng chiều để B hướng vào camera. Vẫn giữ U trên.',
    top: 'U', bottom: 'D', left: 'R', right: 'L', motion: 'Xoay ngang thêm 90°',
  },
  L: {
    title: 'Mặt trái L',
    instruction: 'Từ mặt B, xoay thêm 90° cùng chiều để L hướng vào camera. Vẫn giữ U trên.',
    top: 'U', bottom: 'D', left: 'B', right: 'F', motion: 'Xoay ngang thêm 90°',
  },
  U: {
    title: 'Mặt trên U',
    instruction: 'Trở về F trước, rồi lật cả khối ra sau 90° để U hướng vào camera.',
    top: 'B', bottom: 'F', left: 'L', right: 'R', motion: 'Lật ra sau 90°',
  },
  D: {
    title: 'Mặt dưới D',
    instruction: 'Trở về F trước, rồi lật cả khối ra trước 90° để D hướng vào camera.',
    top: 'F', bottom: 'B', left: 'L', right: 'R', motion: 'Lật ra trước 90°',
  },
}

/** Sơ đồ nhìn từ camera: bốn chữ quanh lưới là bốn cạnh giáp mặt cần chụp. */
export function CaptureGuide({ face, fromStandardPose = false }: { face: Face; fromStandardPose?: boolean }) {
  const guide = fromStandardPose && (face === 'B' || face === 'L')
    ? {
      ...faceGuides[face],
      motion: 'Từ tư thế chuẩn',
      instruction: face === 'B'
        ? 'Trở về tư thế chuẩn: U ở trên, F hướng camera, R bên phải. Xoay cả khối 180° để B hướng camera, giữ U ở trên.'
        : 'Trở về tư thế chuẩn: U ở trên, F hướng camera, R bên phải. Xoay cả khối 90° để L hướng camera, giữ U ở trên.',
    }
    : faceGuides[face]
  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 144 144"
        width="112"
        height="112"
        role="img"
        aria-label={`Mặt ${face} hướng camera; phía trên giáp ${guide.top}, dưới giáp ${guide.bottom}, trái giáp ${guide.left}, phải giáp ${guide.right}`}
        className="shrink-0"
      >
        <rect x="34" y="34" width="76" height="76" rx="3" fill="var(--surface)" stroke="var(--sticker-blue)" strokeWidth="3" />
        <path d="M59 34v76M85 34v76M34 59h76M34 85h76" fill="none" stroke="var(--line)" strokeWidth="2" />
        <rect x="60" y="60" width="24" height="24" rx="3" fill="var(--sticker-blue)" />
        <text x="72" y="77" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--on-action)">{face}</text>
        <text x="72" y="22" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{guide.top}</text>
        <text x="72" y="134" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{guide.bottom}</text>
        <text x="18" y="76" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{guide.left}</text>
        <text x="126" y="76" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">{guide.right}</text>
      </svg>
      <div className="grid gap-1">
        <p className="text-small font-semibold text-ink">{guide.motion}</p>
        <p className="text-small text-ink">{guide.instruction}</p>
        <p className="text-caption text-muted">Camera đứng yên. Chữ quanh lưới chỉ cạnh giáp trên ảnh.</p>
      </div>
    </div>
  )
}
