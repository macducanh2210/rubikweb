import type { ApiSuccess } from './api'

export type SolvingMethod = 'KOCIEMBA'
export type Theme = 'light' | 'dark'
export type AnimationSpeed = 'slow' | 'normal' | 'fast'
export type CameraResolution = '480p' | '720p' | '1080p'

export interface CameraConfig {
  resolution: CameraResolution
  auto_focus: boolean
}

export interface Settings {
  solving_method: SolvingMethod
  theme: Theme
  animation_speed: AnimationSpeed
  camera_config: CameraConfig
}

/** PUT /settings: mọi field đều optional, camera_config được deep-merge. */
export interface UpdateSettingsRequest {
  solving_method?: SolvingMethod
  theme?: Theme
  animation_speed?: AnimationSpeed
  camera_config?: Partial<CameraConfig>
}

export type GetSettingsResponse = ApiSuccess<Settings>
export type UpdateSettingsResponse = ApiSuccess<Settings>
export type ResetSettingsResponse = ApiSuccess<Settings>
