import { describe, expect, it } from 'vitest'
import type { PracticeAttempt } from '../types/practice'
import { calculateAo12, calculatePracticeAchievements, newPracticeRecords } from './practiceAchievements'

function attempt(id: number, duration_cs: number, created_at: string): PracticeAttempt {
  return { id, duration_cs, created_at, scramble: [], ao5_cs: null }
}

describe('calculateAo12', () => {
  it('needs twelve attempts and removes one fastest and one slowest', () => {
    expect(calculateAo12(Array(11).fill(100))).toBeNull()
    expect(calculateAo12([100, 200, ...Array(10).fill(150)])).toBe(150)
    expect(calculateAo12([100, 100, ...Array(10).fill(200)])).toBe(190)
  })

  it('tracks the latest and best rolling averages by attempt id', () => {
    const items = Array.from({ length: 14 }, (_, index) => attempt(index + 1, index >= 12 ? 1000 : 100, '2026-10-11T03:00:00Z')).reverse()
    const stats = calculatePracticeAchievements(items, new Date('2026-10-11T04:00:00Z'))
    expect(stats.bestAo12Cs).toBe(100)
    expect(stats.currentAo12Cs).toBe(190)
  })
})

describe('newPracticeRecords', () => {
  const previous = {
    items: [], total: 5, page: 1, limit: 20,
    best_single_cs: 200, current_ao5_cs: 300, best_ao5_cs: 300,
  }

  it('only announces strictly better results after a saved attempt', () => {
    expect(newPracticeRecords(previous, { ...attempt(6, 199, '2026-10-11T00:00:00Z'), ao5_cs: 299 })).toEqual(['một lượt nhanh nhất', 'Ao5 tốt nhất'])
    expect(newPracticeRecords(previous, { ...attempt(6, 200, '2026-10-11T00:00:00Z'), ao5_cs: 300 })).toEqual([])
    expect(newPracticeRecords(null, attempt(6, 100, '2026-10-11T00:00:00Z'))).toEqual([])
  })
})

describe('practice days and weeks in Vietnam time', () => {
  it('counts a day once, preserves a streak through yesterday, and resets after a gap', () => {
    const items = [
      attempt(1, 500, '2026-10-08T17:00:00Z'), // 09/10 in Vietnam
      attempt(2, 600, '2026-10-09T01:00:00Z'), // same day
      attempt(3, 700, '2026-10-09T17:00:00Z'), // 10/10
    ]
    const stats = calculatePracticeAchievements(items, new Date('2026-10-11T02:00:00Z'))
    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(2)
    expect(calculatePracticeAchievements(items, new Date('2026-10-12T02:00:00Z')).currentStreak).toBe(0)
  })

  it('keeps the longest historic streak after a break', () => {
    const items = [
      attempt(1, 100, '2026-10-01T02:00:00Z'),
      attempt(2, 100, '2026-10-02T02:00:00Z'),
      attempt(3, 100, '2026-10-03T02:00:00Z'),
      attempt(4, 100, '2026-10-10T02:00:00Z'),
    ]
    const stats = calculatePracticeAchievements(items, new Date('2026-10-11T02:00:00Z'))
    expect(stats.bestStreak).toBe(3)
    expect(stats.currentStreak).toBe(1)
  })

  it('groups by Monday in Vietnam and leaves weeks without attempts empty', () => {
    const items = [
      attempt(1, 100, '2026-10-04T16:59:59Z'), // Sunday 04/10 in Vietnam
      attempt(2, 200, '2026-10-04T17:00:00Z'), // Monday 05/10 in Vietnam
      attempt(3, 400, '2026-10-05T02:00:00Z'),
    ]
    const { weeks } = calculatePracticeAchievements(items, new Date('2026-10-11T02:00:00Z'))
    expect(weeks.at(-1)).toEqual({ startDate: '2026-10-05', label: '05/10', averageCs: 300, count: 2 })
    expect(weeks.at(-2)?.averageCs).toBe(100)
    expect(weeks.at(-3)?.averageCs).toBeNull()
  })
})
