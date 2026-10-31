import type { ApiSuccess, MessageData } from './api'
import type { UserRole, UserStatus } from './auth'

export interface ListUsersQuery {
  page?: number
  limit?: number
  search?: string
  include_deleted?: boolean
}

/** Tham số đường dẫn cho lock, unlock và delete. */
export interface AdminUserIdRequest {
  id: number
}

export interface AdminUser {
  id: number
  username: string
  email: string
  display_name: string
  role: UserRole
  status: UserStatus
  created_at: string
}

export interface ListUsersData {
  items: AdminUser[]
  total: number
  page: number
  limit: number
}

export type ListUsersResponse = ApiSuccess<ListUsersData>

export interface ChangeUserLockData {
  id: number
  status: 'locked' | 'active'
}

export type LockUserResponse = ApiSuccess<ChangeUserLockData & { status: 'locked' }>
export type UnlockUserResponse = ApiSuccess<ChangeUserLockData & { status: 'active' }>
export type DeleteUserResponse = ApiSuccess<MessageData>
