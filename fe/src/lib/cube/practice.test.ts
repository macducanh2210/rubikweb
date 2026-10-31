import { describe, expect, it } from 'vitest'
import { applyMoves, isCubeMove } from './index'
import { createPracticeScramble, formatCentiseconds, solvedPracticeCube } from './practice'

describe('luyện tập', () => {
  it('tạo 20 ký hiệu hợp lệ, không xoay cùng trục liên tiếp', () => {
    const axis = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' }
    for (let run = 0; run < 100; run += 1) {
      const scramble = createPracticeScramble()
      expect(scramble).toHaveLength(20)
      expect(scramble.every(isCubeMove)).toBe(true)
      for (let index = 1; index < scramble.length; index += 1) {
        expect(axis[scramble[index][0] as keyof typeof axis]).not.toBe(axis[scramble[index - 1][0] as keyof typeof axis])
      }
      const state = applyMoves(solvedPracticeCube(), scramble)
      expect(Object.values(state).flat()).toHaveLength(54)
    }
  })

  it('hiển thị thời gian chính xác đến 0,01 giây', () => {
    expect(formatCentiseconds(95)).toBe('0.95')
    expect(formatCentiseconds(1234)).toBe('12.34')
    expect(formatCentiseconds(6123)).toBe('1:01.23')
  })
})
