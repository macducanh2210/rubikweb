import type { ApiSuccess, MessageData } from './api'
import type { UserProfile } from './auth'

export type GetCurrentUserResponse = ApiSuccess<UserProfile>

/** multipart/form-data */
export interface UpdateCurrentUserRequest {
  display_name?: string
  avatar?: File
}

export type UpdateCurrentUserResponse = ApiSuccess<UserProfile>

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export type ChangePasswordResponse = ApiSuccess<MessageData>

export interface DeleteCurrentUserRequest {
  password: string
}

export type DeleteCurrentUserResponse = ApiSuccess<MessageData>
