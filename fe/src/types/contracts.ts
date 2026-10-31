import type { ApiSuccess } from './api'
import type {
  ForgotPasswordRequest, ForgotPasswordResponse, LoginRequest, LoginResponse,
  GoogleAuthRequest, GoogleAuthResponse, GoogleLinkResponse,
  LogoutRequest, LogoutResponse, RefreshRequest, RefreshResponse,
  RegisterRequest, RegisterResponse, SendRegistrationOtpRequest, SendRegistrationOtpResponse, ResetPasswordRequest, ResetPasswordResponse,
  VerifyOtpRequest, VerifyOtpResponse,
} from './auth'
import type {
  AdminUserIdRequest, DeleteUserResponse, ListUsersQuery, ListUsersResponse,
  LockUserResponse, UnlockUserResponse,
} from './admin'
import type {
  DetectFinalizeRequest, DetectFinalizeResponse, DetectManualRequest, DetectManualResponse, DetectSingleFaceRequest,
  DetectSingleFaceResponse, SolveRequest, SolveResponse,
} from './cube'
import type {
  CreateHistoryRequest, CreateHistoryResponse, GetHistoryRequest,
  GetHistoryResponse, GetStatisticsResponse, ListHistoryQuery, ListHistoryResponse,
} from './history'
import type {
  CreatePracticeAttemptRequest, CreatePracticeAttemptResponse,
  ListPracticeAttemptsQuery, ListPracticeAttemptsResponse,
  PracticeLeaderboardQuery, PracticeLeaderboardResponse,
} from './practice'
import type {
  CreateDailyAttemptRequest, CreateDailyAttemptResponse, DailyChallengeResponse,
  DailyLeaderboardQuery, DailyLeaderboardResponse,
} from './dailyChallenge'
import type {
  GetSettingsResponse, ResetSettingsResponse, UpdateSettingsRequest,
  UpdateSettingsResponse,
} from './settings'
import type {
  ChangePasswordRequest, ChangePasswordResponse, DeleteCurrentUserRequest,
  DeleteCurrentUserResponse, GetCurrentUserResponse, UpdateCurrentUserRequest,
  UpdateCurrentUserResponse,
} from './user'

/** Request và response của mọi endpoint trong API Contract v5.6. */
export interface ApiEndpoints {
  'POST /auth/register/send-otp': { request: SendRegistrationOtpRequest; response: SendRegistrationOtpResponse }
  'POST /auth/register': { request: RegisterRequest; response: RegisterResponse }
  'POST /auth/login': { request: LoginRequest; response: LoginResponse }
  'POST /auth/google': { request: GoogleAuthRequest; response: GoogleAuthResponse }
  'POST /auth/google/link': { request: GoogleAuthRequest; response: GoogleLinkResponse }
  'POST /auth/refresh': { request: RefreshRequest; response: RefreshResponse }
  'POST /auth/logout': { request: LogoutRequest; response: LogoutResponse }
  'POST /auth/forgot-password': { request: ForgotPasswordRequest; response: ForgotPasswordResponse }
  'POST /auth/verify-otp': { request: VerifyOtpRequest; response: VerifyOtpResponse }
  'POST /auth/reset-password': { request: ResetPasswordRequest; response: ResetPasswordResponse }

  'GET /users/me': { request: void; response: GetCurrentUserResponse }
  'PUT /users/me': { request: UpdateCurrentUserRequest; response: UpdateCurrentUserResponse }
  'PUT /users/me/password': { request: ChangePasswordRequest; response: ChangePasswordResponse }
  'DELETE /users/me': { request: DeleteCurrentUserRequest; response: DeleteCurrentUserResponse }

  'GET /settings': { request: void; response: GetSettingsResponse }
  'PUT /settings': { request: UpdateSettingsRequest; response: UpdateSettingsResponse }
  'POST /settings/reset': { request: void; response: ResetSettingsResponse }

  'GET /admin/users': { request: ListUsersQuery; response: ListUsersResponse }
  'PUT /admin/users/{id}/lock': { request: AdminUserIdRequest; response: LockUserResponse }
  'PUT /admin/users/{id}/unlock': { request: AdminUserIdRequest; response: UnlockUserResponse }
  'DELETE /admin/users/{id}': { request: AdminUserIdRequest; response: DeleteUserResponse }

  'POST /detect/single-face': { request: DetectSingleFaceRequest; response: DetectSingleFaceResponse }
  'POST /detect/finalize': { request: DetectFinalizeRequest; response: DetectFinalizeResponse }
  'POST /detect/manual': { request: DetectManualRequest; response: DetectManualResponse }
  'POST /solve': { request: SolveRequest; response: SolveResponse }

  'POST /history': { request: CreateHistoryRequest; response: CreateHistoryResponse }
  'GET /history': { request: ListHistoryQuery; response: ListHistoryResponse }
  'GET /history/{id}': { request: GetHistoryRequest; response: GetHistoryResponse }
  'GET /statistics': { request: void; response: GetStatisticsResponse }

  'POST /practice/attempts': { request: CreatePracticeAttemptRequest; response: CreatePracticeAttemptResponse }
  'GET /practice/attempts': { request: ListPracticeAttemptsQuery; response: ListPracticeAttemptsResponse }
  'GET /practice/leaderboard': { request: PracticeLeaderboardQuery; response: PracticeLeaderboardResponse }
  'GET /practice/daily-challenge': { request: void; response: DailyChallengeResponse }
  'POST /practice/daily-challenge/attempts': { request: CreateDailyAttemptRequest; response: CreateDailyAttemptResponse }
  'GET /practice/daily-challenge/leaderboard': { request: DailyLeaderboardQuery; response: DailyLeaderboardResponse }
}

export type EndpointRequest<Endpoint extends keyof ApiEndpoints> = ApiEndpoints[Endpoint]['request']
export type EndpointResponse<Endpoint extends keyof ApiEndpoints> = ApiEndpoints[Endpoint]['response']
export type EndpointData<Endpoint extends keyof ApiEndpoints> =
  EndpointResponse<Endpoint> extends ApiSuccess<infer Data> ? Data : never
