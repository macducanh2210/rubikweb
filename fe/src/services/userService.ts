import { api } from './api'
import type {
  ChangePasswordRequest, ChangePasswordResponse, DeleteCurrentUserRequest,
  DeleteCurrentUserResponse, GetCurrentUserResponse, UpdateCurrentUserRequest,
  UpdateCurrentUserResponse,
} from '../types'

export const userService = {
  async getCurrentUser() {
    const response = await api.get<GetCurrentUserResponse>('/users/me')
    return response.data.data
  },
  async updateCurrentUser(request: UpdateCurrentUserRequest) {
    const body = new FormData()
    if (request.display_name !== undefined) body.append('display_name', request.display_name)
    if (request.avatar) body.append('avatar', request.avatar)
    const response = await api.put<UpdateCurrentUserResponse>('/users/me', body)
    return response.data.data
  },
  async changePassword(request: ChangePasswordRequest) {
    const response = await api.put<ChangePasswordResponse>('/users/me/password', request)
    return response.data.data
  },
  async deleteCurrentUser(request: DeleteCurrentUserRequest) {
    const response = await api.delete<DeleteCurrentUserResponse>('/users/me', { data: request })
    return response.data.data
  },
}
