import { api } from './api'
import type { GetSettingsResponse, ResetSettingsResponse, UpdateSettingsRequest, UpdateSettingsResponse } from '../types'

export const settingsService = {
  async getSettings() {
    const response = await api.get<GetSettingsResponse>('/settings')
    return response.data.data
  },
  async updateSettings(request: UpdateSettingsRequest) {
    const response = await api.put<UpdateSettingsResponse>('/settings', request)
    return response.data.data
  },
  async resetSettings() {
    const response = await api.post<ResetSettingsResponse>('/settings/reset')
    return response.data.data
  },
}
