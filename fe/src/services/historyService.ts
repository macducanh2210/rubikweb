import { api } from './api'
import { tokenStorage } from '../lib/tokenStorage'
import type { CreateHistoryRequest, CreateHistoryResponse, GetHistoryResponse, GetStatisticsResponse, ListHistoryQuery, ListHistoryResponse } from '../types'

export const historyService = {
  async create(request: CreateHistoryRequest) {
    const response = await api.post<CreateHistoryResponse>('/history', request)
    return response.data.data
  },
  async getDetail(id: number) {
    const response = await api.get<GetHistoryResponse>(`/history/${id}`)
    return response.data.data
  },
  async list(query: ListHistoryQuery) {
    const response = await api.get<ListHistoryResponse>('/history', { params: query })
    return response.data.data
  },
  async getStatistics() {
    const response = await api.get<GetStatisticsResponse>('/statistics')
    return response.data.data
  },
  /** Gửi khi trang thật sự đóng; keepalive không thể chờ response hoặc refresh token. */
  saveAbandonedOnPageHide(request: CreateHistoryRequest) {
    const token = tokenStorage.getAccessToken()
    if (!token) return
    void fetch(`${import.meta.env.VITE_API_BASE_URL}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      keepalive: true,
    }).catch(() => undefined)
  },
}
