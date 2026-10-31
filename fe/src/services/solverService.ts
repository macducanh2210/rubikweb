import { api } from './api'
import type { SolveRequest, SolveResponse } from '../types'

export const solverService = {
  async solve(request: SolveRequest) {
    const response = await api.post<SolveResponse>('/solve', request)
    return response.data.data
  },
}
