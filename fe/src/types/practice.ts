import type { ApiSuccess } from './api'

export interface PracticeAttempt {
  id: number
  scramble: string[]
  duration_cs: number
  ao5_cs: number | null
  created_at: string
}

export interface CreatePracticeAttemptRequest {
  scramble: string[]
  duration_cs: number
}

export type CreatePracticeAttemptResponse = ApiSuccess<PracticeAttempt>

export interface ListPracticeAttemptsQuery {
  page?: number
  limit?: number
}

export interface ListPracticeAttemptsData {
  items: PracticeAttempt[]
  total: number
  page: number
  limit: number
  best_single_cs: number | null
  current_ao5_cs: number | null
  best_ao5_cs: number | null
}

export type ListPracticeAttemptsResponse = ApiSuccess<ListPracticeAttemptsData>

export interface PracticeLeaderboardQuery {
  limit?: number
}

export interface PracticeLeaderboardEntry {
  rank: number
  user_id: number
  username: string
  display_name: string
  duration_cs: number
  total_attempts: number
}

export interface PracticeLeaderboardData {
  single: PracticeLeaderboardEntry[]
  ao5: PracticeLeaderboardEntry[]
}

export type PracticeLeaderboardResponse = ApiSuccess<PracticeLeaderboardData>
