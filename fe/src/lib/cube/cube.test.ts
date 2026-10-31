import { describe, expect, it } from 'vitest'
import type { CubeState, FaceColors, StickerColor } from '../../types'
import { applyMove, applyMoves, invertMove, isSolved, solutionMatchesState, type CubeMove } from './index'

function filled(color: StickerColor): FaceColors { return Array(9).fill(color) as FaceColors }
const solved: CubeState = {
  U: filled('white'), D: filled('yellow'), F: filled('green'),
  B: filled('blue'), L: filled('orange'), R: filled('red'),
}
const moves: CubeMove[] = ['R', "R'", 'R2', 'L', "L'", 'L2', 'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2']

describe('phép xoay khối Rubik', () => {
  it.each(moves)('%s lặp đủ vòng trả về trạng thái ban đầu', (move) => {
    const count = move.endsWith('2') ? 2 : 4
    expect(applyMoves(solved, Array(count).fill(move))).toEqual(solved)
  })

  it.each(moves)('%s rồi nghịch đảo trả về trạng thái ban đầu', (move) => {
    expect(applyMoves(solved, [move, invertMove(move)])).toEqual(solved)
  })

  it('không sửa dữ liệu đầu vào', () => {
    const before = structuredClone(solved)
    applyMove(solved, 'R')
    expect(solved).toEqual(before)
  })

  it('chặn lời giải không khớp và ký hiệu chữ thường', () => {
    const scrambled = applyMove(solved, 'R')
    expect(solutionMatchesState(scrambled, ["R'"])).toBe(true)
    expect(solutionMatchesState(scrambled, ['R'])).toBe(false)
    expect(solutionMatchesState(scrambled, ['r'])).toBe(false)
    expect(solutionMatchesState(solved, [])).toBe(true)
  })

  it('giải đúng cube_state và moves mẫu của GET /history/{id}', () => {
    const historyState: CubeState = {
      U: ['red', 'green', 'white', 'white', 'white', 'white', 'white', 'white', 'red'],
      D: ['yellow', 'yellow', 'green', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow'],
      F: ['green', 'green', 'green', 'green', 'green', 'white', 'green', 'green', 'white'],
      B: ['orange', 'red', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue', 'blue'],
      L: ['white', 'orange', 'orange', 'orange', 'orange', 'orange', 'orange', 'orange', 'orange'],
      R: ['yellow', 'blue', 'blue', 'red', 'red', 'red', 'red', 'red', 'red'],
    }
    expect(isSolved(applyMoves(historyState, ['R', 'U', "R'", "U'"]))).toBe(true)
  })
})
