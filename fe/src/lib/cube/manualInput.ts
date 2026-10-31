import type { CubePreviewFaces, CubeState, Face, FaceColors, StickerColor } from '../../types'

export const manualFaceOrder: readonly Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
export const manualColors: readonly StickerColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']
export type ManualCubeDraft = Record<Face, (StickerColor | null)[]>

const defaultCenters: Record<Face, StickerColor> = {
  U: 'white', D: 'yellow', F: 'green', B: 'blue', L: 'orange', R: 'red',
}

function isStickerColor(value: unknown): value is StickerColor {
  return manualColors.includes(value as StickerColor)
}

/** Sao chép màu đã quét; mặt chưa nhập chỉ có màu tâm làm gợi ý. */
export function createManualCubeDraft(seed?: CubePreviewFaces): ManualCubeDraft {
  return Object.fromEntries(manualFaceOrder.map((face) => {
    const supplied = Array.isArray(seed?.[face]) ? seed[face] : undefined
    const colors = Array.from({ length: 9 }, (_, index) => {
      const value = supplied?.[index]
      return isStickerColor(value) ? value : index === 4 ? defaultCenters[face] : null
    })
    return [face, colors]
  })) as ManualCubeDraft
}

export function paintManualSticker(draft: ManualCubeDraft, face: Face, index: number, color: StickerColor): ManualCubeDraft {
  if (!Number.isInteger(index) || index < 0 || index > 8) return draft
  const colors = [...draft[face]]
  colors[index] = color
  return { ...draft, [face]: colors }
}

export function rotateManualFace(draft: ManualCubeDraft, face: Face): ManualCubeDraft {
  const colors = draft[face]
  return { ...draft, [face]: [colors[6], colors[3], colors[0], colors[7], colors[4], colors[1], colors[8], colors[5], colors[2]] }
}

export function manualCubeStats(draft: ManualCubeDraft) {
  const counts = Object.fromEntries(manualColors.map((color) => [color, 0])) as Record<StickerColor, number>
  let missingCount = 0
  for (const face of manualFaceOrder) {
    for (const color of draft[face]) {
      if (color) counts[color] += 1
      else missingCount += 1
    }
  }
  const centers = manualFaceOrder.map((face) => draft[face][4])
  return { counts, missingCount, distinctCenters: centers.every(Boolean) && new Set(centers).size === 6 }
}

/** Chỉ kiểm tra dữ liệu màu; tính khả thi hình học được máy chủ kiểm tra. */
export function validateManualCube(draft: ManualCubeDraft): { cubeState: CubeState | null; error: string | null } {
  const { counts, missingCount, distinctCenters } = manualCubeStats(draft)
  if (missingCount > 0) return { cubeState: null, error: `Còn ${missingCount} ô chưa tô màu. Chọn từng mặt trong net để tô đủ sáu mặt.` }
  if (!distinctCenters) return { cubeState: null, error: 'Sáu ô tâm phải có sáu màu khác nhau. Kiểm tra ô giữa của từng mặt.' }
  if (manualColors.some((color) => counts[color] !== 9)) {
    return { cubeState: null, error: 'Mỗi màu phải có đúng 9 ô. Kiểm tra số lượng màu bên dưới khối.' }
  }
  const cubeState = Object.fromEntries(manualFaceOrder.map((face) => [face, [...draft[face]] as FaceColors])) as Record<Face, FaceColors>
  return { cubeState, error: null }
}
