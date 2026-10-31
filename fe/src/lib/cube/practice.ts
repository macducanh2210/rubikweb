import type { CubeState, Face, FaceColors, StickerColor } from '../../types'
import type { CubeMove } from './index'

const faceAxes: Record<Face, 'x' | 'y' | 'z'> = {
  R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z',
}
const faces: Face[] = ['R', 'L', 'U', 'D', 'F', 'B']
const suffixes = ['', "'", '2'] as const

function secureRandomInt(max: number): number {
  const values = new Uint32Array(1)
  const range = 2 ** 32
  const ceiling = range - range % max
  do {
    crypto.getRandomValues(values)
  } while (values[0] >= ceiling)
  return values[0] % max
}

export function createPracticeScramble(randomInt = secureRandomInt): CubeMove[] {
  const result: CubeMove[] = []
  let lastAxis: 'x' | 'y' | 'z' | null = null
  for (let index = 0; index < 20; index += 1) {
    const candidates = faces.filter((face) => faceAxes[face] !== lastAxis)
    const face = candidates[randomInt(candidates.length)]
    result.push(`${face}${suffixes[randomInt(suffixes.length)]}` as CubeMove)
    lastAxis = faceAxes[face]
  }
  return result
}

function filled(color: StickerColor): FaceColors {
  return Array(9).fill(color) as FaceColors
}

export function solvedPracticeCube(): CubeState {
  return {
    U: filled('white'), D: filled('yellow'), F: filled('green'),
    B: filled('blue'), L: filled('orange'), R: filled('red'),
  }
}

export function formatCentiseconds(value: number): string {
  const minutes = Math.floor(value / 6000)
  const seconds = Math.floor(value / 100) % 60
  const centiseconds = value % 100
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
    : `${seconds}.${String(centiseconds).padStart(2, '0')}`
}
