import { api } from './api'
import type { DeleteUserResponse, ListUsersQuery, ListUsersResponse, LockUserResponse, UnlockUserResponse } from '../types'

export const adminService = {
  async listUsers(query: ListUsersQuery) {
    const response = await api.get<ListUsersResponse>('/admin/users', { params: query })
    return response.data.data
  },
  async lockUser(id: number) {
    const response = await api.put<LockUserResponse>(`/admin/users/${id}/lock`)
    return response.data.data
  },
  async unlockUser(id: number) {
    const response = await api.put<UnlockUserResponse>(`/admin/users/${id}/unlock`)
    return response.data.data
  },
  async deleteUser(id: number) {
    const response = await api.delete<DeleteUserResponse>(`/admin/users/${id}`)
    return response.data.data
  },
}
