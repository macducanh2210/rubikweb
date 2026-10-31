import type { ApiSuccess } from './api'

export interface DailyChallengeAttempt {
  id: number
  duration_cs: number
  created_at: string
}

export interface DailyChallengeData {
  id: number
  date: string
  timezone: 'Asia/Ho_Chi_Minh'
  scramble: string[]
  starts_at: string
  ends_at: string
  server_time: string
  my_attempt: DailyChallengeAttempt | null
}

export interface CreateDailyAttemptRequest {
  challenge_id: number
  duration_cs: number
  client_attempt_id: string
}

export interface DailyLeaderboardQuery {
  challenge_id?: number
  limit?: number
}

export interface DailyLeaderboardEntry {
  rank: number
  user_id: number
  username: string
  display_name: string
  duration_cs: number
  created_at: string
}

export interface DailyLeaderboardData {
  challenge_id: number
  date: string
  items: DailyLeaderboardEntry[]
  total_participants: number
  my_rank: number | null
}

export type DailyChallengeResponse = ApiSuccess<DailyChallengeData>
export type CreateDailyAttemptResponse = ApiSuccess<DailyChallengeAttempt>
export type DailyLeaderboardResponse = ApiSuccess<DailyLeaderboardData>
