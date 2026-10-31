import { describe, expect, it } from 'vitest'
import type { Face } from '../types'
import { captureOrder, nextUncapturedFace } from './scanCapture'

describe('chọn mặt cần chụp', () => {
  it('bắt đầu ở F và giữ thứ tự F → R → B → L → U → D', () => {
    const captures: Partial<Record<Face, boolean>> = {}
    for (const face of ['F', 'R', 'B', 'L', 'U', 'D'] as const) {
      expect(nextUncapturedFace(captures)).toBe(face)
      captures[face] = true
    }
    expect(nextUncapturedFace(captures)).toBeNull()
  })

  it('chụp lại F sau F và R thì tiếp tục ở B', () => {
    const captures = { F: { face_id: 1 }, R: { face_id: 2 } }
    expect(nextUncapturedFace({ ...captures, F: { face_id: 3 } })).toBe('B')
  })

  it('chọn chụp D sớm vẫn tiếp tục với các mặt còn thiếu', () => {
    expect(nextUncapturedFace({ F: true, R: true, D: true })).toBe('B')
  })

  it('chụp trước một mặt bất kỳ thì quay lại F nếu F còn thiếu', () => {
    for (const face of captureOrder.filter((face) => face !== 'F')) {
      expect(nextUncapturedFace({ [face]: true })).toBe('F')
    }
  })

  it('chỉ kết thúc sau khi đủ 6 mặt, dù mặt cuối không phải D', () => {
    const captures = { F: true, R: true, L: true, U: true, D: true }
    expect(nextUncapturedFace(captures)).toBe('B')
    expect(nextUncapturedFace({ ...captures, B: true })).toBeNull()
  })
})
