import { api } from './api'
import type {
  CreatePracticeAttemptRequest, CreatePracticeAttemptResponse,
  ListPracticeAttemptsQuery, ListPracticeAttemptsResponse,
  PracticeLeaderboardQuery, PracticeLeaderboardResponse,
} from '../types'

export const practiceService = {
  async createAttempt(request: CreatePracticeAttemptRequest) {
    const response = await api.post<CreatePracticeAttemptResponse>('/practice/attempts', request)
    return response.data.data
  },
  async listAttempts(query: ListPracticeAttemptsQuery = {}, signal?: AbortSignal) {
    const response = await api.get<ListPracticeAttemptsResponse>('/practice/attempts', { params: query, signal })
    return response.data.data
  },
  async getLeaderboard(query: PracticeLeaderboardQuery = {}) {
    const response = await api.get<PracticeLeaderboardResponse>('/practice/leaderboard', { params: query })
    return response.data.data
  },
}
