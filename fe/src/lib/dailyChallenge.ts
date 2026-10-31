import type { CreateDailyAttemptRequest, DailyChallengeData } from '../types'

export function challengeRemainingMs(challenge: Pick<DailyChallengeData, 'ends_at' | 'server_time'>): number {
  return Math.max(0, Date.parse(challenge.ends_at) - Date.parse(challenge.server_time))
}

export function remainingAtDeadline(deadline: number, now: number): number {
  return Math.max(0, deadline - now)
}

/** Starting before GET conservatively accounts for network delay at midnight. */
export function challengeDeadline(challenge: Pick<DailyChallengeData, 'ends_at' | 'server_time'>, requestStartedAt: number): number {
  return requestStartedAt + challengeRemainingMs(challenge)
}

export function dailyAttemptDuration(startedAt: number, stoppedAt: number): number {
  return Math.min(360000, Math.max(1, Math.round((stoppedAt - startedAt) / 10)))
}

export function readPendingDailyAttempt(raw: string | null): CreateDailyAttemptRequest | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<CreateDailyAttemptRequest> | null
    if (!value || !Number.isInteger(value.challenge_id) || Number(value.challenge_id) < 1
      || !Number.isInteger(value.duration_cs) || Number(value.duration_cs) < 1 || Number(value.duration_cs) > 360000
      || typeof value.client_attempt_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.client_attempt_id)) return null
    return value as CreateDailyAttemptRequest
  } catch { return null }
}
