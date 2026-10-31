import { describe, expect, it } from 'vitest'
import { movingStepIndex } from './moveStepView'

describe('ô vàng khi xoay lời giải', () => {
  it('giữ đúng ký hiệu đang xoay, kể cả khi lùi bước', () => {
    expect(movingStepIndex(0, 1)).toBe(0)
    expect(movingStepIndex(1, 2)).toBe(1)
    expect(movingStepIndex(2, 1)).toBe(1)
    expect(movingStepIndex(1, 0)).toBe(0)
  })

  it('từ chối nhảy qua nhiều bước', () => {
    expect(() => movingStepIndex(0, 2)).toThrow()
  })
})
