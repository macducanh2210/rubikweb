import { api } from './api'
import type {
  CreateDailyAttemptRequest, CreateDailyAttemptResponse, DailyChallengeResponse,
  DailyLeaderboardQuery, DailyLeaderboardResponse,
} from '../types'

export const dailyChallengeService = {
  async getChallenge() {
    const response = await api.get<DailyChallengeResponse>('/practice/daily-challenge')
    return response.data.data
  },
  async createAttempt(request: CreateDailyAttemptRequest) {
    const response = await api.post<CreateDailyAttemptResponse>('/practice/daily-challenge/attempts', request)
    return response.data.data
  },
  async getLeaderboard(query: DailyLeaderboardQuery = {}) {
    const response = await api.get<DailyLeaderboardResponse>('/practice/daily-challenge/leaderboard', { params: query })
    return response.data.data
  },
}
