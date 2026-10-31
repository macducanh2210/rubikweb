import { describe, expect, it } from 'vitest'
import { animationConfig, autoPauseMs, estimateSolutionDurationMs, moveDurationMs, splitHalfTurnDuration } from './animationConfig'

describe('thời gian hoạt ảnh lời giải', () => {
  it.each([
    ['slow', 3600, 2000, 3000, 19_600],
    ['normal', 1300, 1000, 2000, 8550],
    ['fast', 1000, 700, 1500, 6400],
  ] as const)('%s: cộng khoảng chờ đầu, thời gian xoay và hai khoảng nghỉ cho ba bước', (speed, duration, gap, startDelay, total) => {
    expect(animationConfig[speed]).toEqual({ moveDurationMs: duration, gapMs: gap, startDelayMs: startDelay })
    expect(autoPauseMs(speed, false)).toBe(startDelay)
    expect(autoPauseMs(speed, true)).toBe(gap)
    expect(estimateSolutionDurationMs(['R', 'U2', "F'"], speed)).toBe(total)
  })

  it('bước đơn chỉ có khoảng chờ đầu; nửa vòng mất 1,5 lần thời gian xoay', () => {
    expect(moveDurationMs('B2', 'normal')).toBe(1950)
    expect(estimateSolutionDurationMs(['B2'], 'normal')).toBe(3950)
    expect(estimateSolutionDurationMs([], 'normal')).toBe(0)
  })

  it.each(['slow', 'normal', 'fast'] as const)('%s chia nửa vòng thành hai lượt 90° và một lần dừng', (speed) => {
    const total = moveDurationMs('B2', speed)
    const { quarterDurationMs, pauseMs } = splitHalfTurnDuration(total)
    expect(quarterDurationMs).toBeGreaterThan(0)
    expect(pauseMs).toBeGreaterThan(0)
    expect(quarterDurationMs * 2 + pauseMs).toBe(total)
  })

  it('mức chậm cho 20 bước xoay 90° gồm chờ đầu và 19 khoảng nghỉ dài', () => {
    expect(estimateSolutionDurationMs(Array(20).fill('R'), 'slow')).toBe(113_000)
  })

  it('không ước tính cho ký hiệu không hợp lệ', () => {
    expect(() => estimateSolutionDurationMs(['r'], 'normal')).toThrow('Ký hiệu xoay không hợp lệ')
  })
})
