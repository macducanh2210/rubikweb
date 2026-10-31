import { describe, expect, it } from 'vitest'
import { describeMoveForSpeech } from './moveSpeech'

describe('lời đọc ký hiệu xoay', () => {
  const faces = { U: 'trên', D: 'dưới', F: 'trước', B: 'sau', L: 'trái', R: 'phải' }

  it('đọc đúng mặt và chiều của cả 18 ký hiệu', () => {
    for (const [face, name] of Object.entries(faces)) {
      expect(describeMoveForSpeech(face)).toBe(`Mặt ${name}, xoay thuận chiều kim đồng hồ.`)
      expect(describeMoveForSpeech(`${face}'`)).toBe(`Mặt ${name}, xoay ngược chiều kim đồng hồ.`)
      expect(describeMoveForSpeech(`${face}2`)).toBe(`Mặt ${name}, xoay hai lần.`)
    }
  })

  it('từ chối ký hiệu chữ thường hoặc sai định dạng', () => {
    for (const move of ['r', 'u2', 'R3', 'Rw', '']) {
      expect(() => describeMoveForSpeech(move)).toThrow('Ký hiệu xoay không hợp lệ')
    }
  })

  it('báo rõ khi đang xoay ngược để lùi bước', () => {
    expect(describeMoveForSpeech('R', true)).toBe('Quay lại bước trước. Mặt phải, xoay thuận chiều kim đồng hồ.')
  })
})
