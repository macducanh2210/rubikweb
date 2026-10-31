import type { CubeState, Face, FaceColors, StickerColor } from '../../types'

export type CubeMove = `${'R' | 'L' | 'U' | 'D' | 'F' | 'B'}${'' | "'" | '2'}`
type Axis = 'x' | 'y' | 'z'
type Vector = readonly [number, number, number]

interface FaceletSlot {
  face: Face
  index: number
  position: Vector
  normal: Vector
}

const faces: readonly Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const moveSpec: Record<CubeMove[0], { axis: Axis; layer: number }> = {
  R: { axis: 'x', layer: 1 }, L: { axis: 'x', layer: -1 },
  U: { axis: 'y', layer: 1 }, D: { axis: 'y', layer: -1 },
  F: { axis: 'z', layer: 1 }, B: { axis: 'z', layer: -1 },
}
const axisIndex: Record<Axis, number> = { x: 0, y: 1, z: 2 }

function faceletGeometry(face: Face, row: number, col: number): { position: Vector; normal: Vector } {
  switch (face) {
    case 'F': return { position: [col - 1, 1 - row, 1], normal: [0, 0, 1] }
    case 'R': return { position: [1, 1 - row, 1 - col], normal: [1, 0, 0] }
    case 'B': return { position: [1 - col, 1 - row, -1], normal: [0, 0, -1] }
    case 'L': return { position: [-1, 1 - row, col - 1], normal: [-1, 0, 0] }
    case 'U': return { position: [col - 1, 1, row - 1], normal: [0, 1, 0] }
    case 'D': return { position: [col - 1, -1, 1 - row], normal: [0, -1, 0] }
  }
}

function vectorKey(position: Vector, normal: Vector): string {
  return `${position.join(',')};${normal.join(',')}`
}

const slots: FaceletSlot[] = faces.flatMap((face) => Array.from({ length: 9 }, (_, index) => ({
  face, index, ...faceletGeometry(face, Math.floor(index / 3), index % 3),
})))
const slotByVector = new Map(slots.map((slot) => [vectorKey(slot.position, slot.normal), slot]))

function rotateVector([x, y, z]: Vector, axis: Axis, quarter: 1 | -1): Vector {
  if (axis === 'x') return quarter === 1 ? [x, -z, y] : [x, z, -y]
  if (axis === 'y') return quarter === 1 ? [z, y, -x] : [-z, y, x]
  return quarter === 1 ? [-y, x, z] : [y, -x, z]
}

function cloneState(state: CubeState): CubeState {
  return {
    U: [...state.U] as FaceColors, D: [...state.D] as FaceColors,
    F: [...state.F] as FaceColors, B: [...state.B] as FaceColors,
    L: [...state.L] as FaceColors, R: [...state.R] as FaceColors,
  }
}

function quarterTurn(state: CubeState, face: CubeMove[0], inverse: boolean): CubeState {
  const { axis, layer } = moveSpec[face]
  // Chiều kim đồng hồ khi nhìn từ ngoài vào mặt = -90° quanh pháp tuyến ngoài.
  const quarter: 1 | -1 = (layer === 1 ? (inverse ? 1 : -1) : (inverse ? -1 : 1))
  const next = cloneState(state)
  for (const slot of slots) {
    if (slot.position[axisIndex[axis]] !== layer) continue
    const position = rotateVector(slot.position, axis, quarter)
    const normal = rotateVector(slot.normal, axis, quarter)
    const destination = slotByVector.get(vectorKey(position, normal))
    if (!destination) throw new Error('Không ánh xạ được ô khối Rubik')
    next[destination.face][destination.index] = state[slot.face][slot.index]
  }
  return next
}

export function isCubeMove(move: string): move is CubeMove {
  return /^[RLUDFB](?:'|2)?$/.test(move)
}

export function applyMove(state: CubeState, move: string): CubeState {
  if (!isCubeMove(move)) throw new Error(`Ký hiệu xoay không hợp lệ: ${move}`)
  const face = move[0] as CubeMove[0]
  const turns = move.endsWith('2') ? 2 : 1
  let next = state
  for (let index = 0; index < turns; index += 1) next = quarterTurn(next, face, move.endsWith("'"))
  return next
}

export function applyMoves(state: CubeState, moves: readonly string[]): CubeState {
  return moves.reduce(applyMove, state)
}

export function invertMove(move: string): CubeMove {
  if (!isCubeMove(move)) throw new Error(`Ký hiệu xoay không hợp lệ: ${move}`)
  if (move.endsWith('2')) return move
  return (move.endsWith("'") ? move[0] : `${move}'`) as CubeMove
}

export function isSolved(state: CubeState): boolean {
  return faces.every((face) => state[face].every((color: StickerColor) => color === state[face][4]))
}

/** Reject malformed moves and solutions that do not solve the supplied cube state. */
export function solutionMatchesState(state: CubeState, moves: readonly string[]): boolean {
  if (!moves.every(isCubeMove)) return false
  try {
    return isSolved(applyMoves(state, moves))
  } catch {
    return false
  }
}

export function faceletPosition(face: Face, index: number): { position: Vector; normal: Vector } {
  return faceletGeometry(face, Math.floor(index / 3), index % 3)
}
