import type { ListPracticeAttemptsData, PracticeAttempt } from '../types/practice'

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface PracticeWeek {
  startDate: string
  label: string
  averageCs: number | null
  count: number
}

function vietnamDay(instant: string | Date): number {
  return Math.floor((new Date(instant).getTime() + VIETNAM_OFFSET_MS) / DAY_MS)
}

function dayDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function mondayOf(day: number): number {
  return day - ((day + 3) % 7)
}

/** Ao12: bỏ đúng một lượt nhanh nhất và một lượt chậm nhất trong 12 lượt liên tiếp. */
export function calculateAo12(durations: number[]): number | null {
  if (durations.length !== 12) return null
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return Math.round((total - Math.min(...durations) - Math.max(...durations)) / 10)
}

export function newPracticeRecords(previous: ListPracticeAttemptsData | null, saved: PracticeAttempt): string[] {
  if (!previous) return []
  const records: string[] = []
  if (previous.best_single_cs === null || saved.duration_cs < previous.best_single_cs) records.push('một lượt nhanh nhất')
  if (saved.ao5_cs !== null && (previous.best_ao5_cs === null || saved.ao5_cs < previous.best_ao5_cs)) records.push('Ao5 tốt nhất')
  return records
}

export function calculatePracticeAchievements(attempts: PracticeAttempt[], now = new Date()) {
  const chronological = [...attempts].sort((a, b) => a.id - b.id)
  let bestAo12Cs: number | null = null
  let currentAo12Cs: number | null = null

  for (let index = 11; index < chronological.length; index += 1) {
    const ao12 = calculateAo12(chronological.slice(index - 11, index + 1).map((item) => item.duration_cs))!
    currentAo12Cs = ao12
    if (bestAo12Cs === null || ao12 < bestAo12Cs) bestAo12Cs = ao12
  }

  const days = [...new Set(chronological.map((item) => vietnamDay(item.created_at)))].sort((a, b) => a - b)
  let bestStreak = 0
  let endingStreak = 0
  for (let index = 0; index < days.length; index += 1) {
    endingStreak = index > 0 && days[index] === days[index - 1] + 1 ? endingStreak + 1 : 1
    bestStreak = Math.max(bestStreak, endingStreak)
  }
  const today = vietnamDay(now)
  const currentStreak = days.at(-1) === today || days.at(-1) === today - 1 ? endingStreak : 0

  const currentMonday = mondayOf(today)
  const weeks: PracticeWeek[] = Array.from({ length: 12 }, (_, index) => {
    const monday = currentMonday - (11 - index) * 7
    const durations = chronological
      .filter((item) => {
        const day = vietnamDay(item.created_at)
        return day >= monday && day < monday + 7
      })
      .map((item) => item.duration_cs)
    const startDate = dayDate(monday)
    return {
      startDate,
      label: `${startDate.slice(8, 10)}/${startDate.slice(5, 7)}`,
      averageCs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      count: durations.length,
    }
  })

  return { currentAo12Cs, bestAo12Cs, currentStreak, bestStreak, weeks }
}
