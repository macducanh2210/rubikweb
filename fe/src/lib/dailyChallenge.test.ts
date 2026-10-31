import { describe, expect, it } from 'vitest'
import { challengeDeadline, challengeRemainingMs, dailyAttemptDuration, readPendingDailyAttempt, remainingAtDeadline } from './dailyChallenge'

describe('daily challenge timing and recovery', () => {
  it('uses server time at Vietnam midnight without consulting the client clock', () => {
    expect(challengeRemainingMs({ server_time: '2026-10-11T16:59:50Z', ends_at: '2026-10-11T17:00:00Z' })).toBe(10000)
    expect(challengeRemainingMs({ server_time: '2026-10-11T17:00:01Z', ends_at: '2026-10-11T17:00:00Z' })).toBe(0)
    expect(remainingAtDeadline(12000, 22000)).toBe(0)
    expect(remainingAtDeadline(12000, 3000)).toBe(9000)
  })
  it('rounds monotonic elapsed time to centiseconds within API limits', () => {
    expect(dailyAttemptDuration(2000, 32345)).toBe(3035)
    expect(dailyAttemptDuration(2000, 2000)).toBe(1)
    expect(dailyAttemptDuration(0, 3600001)).toBe(360000)
  })
  it('does not extend a challenge when a slow response arrives after midnight', () => {
    const deadline = challengeDeadline({ server_time: '2026-10-11T16:59:58Z', ends_at: '2026-10-11T17:00:00Z' }, 1000)
    expect(remainingAtDeadline(deadline, 5000)).toBe(0)
  })
  it('recovers exactly the same attempt UUID and duration for retries', () => {
    const request = { challenge_id: 5, duration_cs: 1234, client_attempt_id: '4a655fe4-54a1-431d-b0cf-e49af19ba84c' }
    expect(readPendingDailyAttempt(JSON.stringify(request))).toEqual(request)
    for (const raw of [null, '{', '{}', '[]', JSON.stringify({ ...request, duration_cs: 1.1 }),
      JSON.stringify({ ...request, challenge_id: 0 }), JSON.stringify({ ...request, duration_cs: 360001 }),
      JSON.stringify({ ...request, client_attempt_id: 'invalid' })]) expect(readPendingDailyAttempt(raw)).toBeNull()
  })
})
