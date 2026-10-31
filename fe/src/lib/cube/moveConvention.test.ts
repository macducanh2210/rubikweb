import { describe, expect, it } from 'vitest'
import type { CubeState, Face } from '../../types'
import { applyMove, isCubeMove, type CubeMove } from './index'

type LabeledState = Record<Face, string[]>
type FaceLetter = Face

const faces: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const turns: CubeMove[] = faces.flatMap((face) => [face, `${face}'`, `${face}2`] as CubeMove[])

function labeledState(): LabeledState {
  return Object.fromEntries(faces.map((face) => [face, Array.from({ length: 9 }, (_, index) => `${face}${index}`)])) as LabeledState
}

// Each strip is ordered so a clockwise turn sends its three entries to the next strip.
// The index order follows the capture contract: U top borders B; D top borders F.
const clockwiseStrips: Record<FaceLetter, readonly (readonly [Face, readonly number[]])[]> = {
  U: [['F', [0, 1, 2]], ['L', [0, 1, 2]], ['B', [0, 1, 2]], ['R', [0, 1, 2]]],
  D: [['F', [6, 7, 8]], ['R', [6, 7, 8]], ['B', [6, 7, 8]], ['L', [6, 7, 8]]],
  R: [['F', [2, 5, 8]], ['U', [2, 5, 8]], ['B', [6, 3, 0]], ['D', [2, 5, 8]]],
  L: [['F', [0, 3, 6]], ['D', [0, 3, 6]], ['B', [8, 5, 2]], ['U', [0, 3, 6]]],
  F: [['U', [6, 7, 8]], ['R', [0, 3, 6]], ['D', [2, 1, 0]], ['L', [8, 5, 2]]],
  B: [['U', [0, 1, 2]], ['L', [6, 3, 0]], ['D', [8, 7, 6]], ['R', [2, 5, 8]]],
}

function clockwise(state: LabeledState, face: FaceLetter): LabeledState {
  const next = structuredClone(state)
  // Clockwise face rotation viewed from outside: old upper-left -> new upper-right.
  const clockwiseDestination = [2, 5, 8, 1, 4, 7, 0, 3, 6]
  clockwiseDestination.forEach((destination, source) => {
    next[face][destination] = state[face][source]
  })
  const strips = clockwiseStrips[face]
  strips.forEach(([sourceFace, sourceIndices], stripIndex) => {
    const [destinationFace, destinationIndices] = strips[(stripIndex + 1) % strips.length]
    sourceIndices.forEach((sourceIndex, stickerIndex) => {
      next[destinationFace][destinationIndices[stickerIndex]] = state[sourceFace][sourceIndex]
    })
  })
  return next
}

export function expectedMove(state: LabeledState, move: CubeMove): LabeledState {
  const count = move.endsWith('2') ? 2 : move.endsWith("'") ? 3 : 1
  let next = state
  for (let index = 0; index < count; index += 1) next = clockwise(next, move[0] as FaceLetter)
  return next
}

describe('quy ước 18 ký hiệu trên 54 nhãn riêng', () => {
  it.each(turns)('%s chuyển đúng mọi ô và xoay đúng mặt của nó', (move) => {
    const initial = labeledState()
    const actual = applyMove(initial as unknown as CubeState, move) as unknown as LabeledState
    expect(actual).toEqual(expectedMove(initial, move))
    expect(faces.flatMap((face) => actual[face]).sort()).toEqual(faces.flatMap((face) => initial[face]).sort())
  })

  it.each(['r', "u'", 'f2', 'Rr', 'R2\''])('từ chối ký hiệu không hợp lệ %s', (move) => {
    expect(isCubeMove(move)).toBe(false)
    expect(() => applyMove(labeledState() as unknown as CubeState, move)).toThrow()
  })
})
