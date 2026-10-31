import type { CubeState, FaceColors, StickerColor } from '../../types'

function filled(color: StickerColor): FaceColors {
  return Array(9).fill(color) as FaceColors
}

export const demoCube: CubeState = {
  U: filled('white'),
  D: filled('yellow'),
  F: ['green', 'green', 'red', 'green', 'green', 'green', 'blue', 'green', 'green'],
  B: filled('blue'),
  L: filled('orange'),
  R: filled('red'),
}

export const demoMoves = ['R', 'U', "R'", 'F2', "U'", 'L', 'D2', 'R2', 'F', "L'"]
