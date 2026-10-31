import type { ApiSuccess } from './api'
import type { CubeState, Face } from './cube'
import type { SolvingMethod } from './settings'

export type SolveStatus = 'completed' | 'abandoned'

export interface CreateHistoryRequest {
  solution_id: number
  start_time: string
  end_time: string
  status: SolveStatus
}

export interface CreateHistoryData {
  id: number
  solution_id: number
  duration: number
  status: SolveStatus
  created_at: string
}

export type CreateHistoryResponse = ApiSuccess<CreateHistoryData>

export interface ListHistoryQuery {
  page?: number
  limit?: number
}

export interface GetHistoryRequest {
  id: number
}

export interface HistoryItem extends CreateHistoryData {
  total_steps: number
}

export interface ListHistoryData {
  items: HistoryItem[]
  total: number
  page: number
  limit: number
}

export type ListHistoryResponse = ApiSuccess<ListHistoryData>

export interface HistoryDetail {
  id: number
  status: SolveStatus
  duration: number
  start_time: string
  end_time: string
  created_at: string
  solution: {
    id: number
    moves: string[]
    total_steps: number
    algorithm: SolvingMethod
  }
  rubik_state: {
    id: number
    cube_state: CubeState
    face_images: Partial<Record<Face, string>>
  }
}

export type GetHistoryResponse = ApiSuccess<HistoryDetail>

export interface StatisticsProgressItem {
  date: string
  duration: number
}

export interface StatisticsData {
  total_solves: number
  average_time: number | null
  best_time: number | null
  average_steps: number | null
  progress: StatisticsProgressItem[]
  updated_at: string | null
}

export type GetStatisticsResponse = ApiSuccess<StatisticsData>
