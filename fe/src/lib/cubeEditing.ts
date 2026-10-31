import type { FaceColors } from '../types'

/** Mảng 3×3 theo hàng: ô mới[r][c] = ô cũ[2-c][r]. */
export function rotateFaceClockwise(colors: FaceColors): FaceColors {
  return [colors[6], colors[3], colors[0], colors[7], colors[4], colors[1], colors[8], colors[5], colors[2]]
}
