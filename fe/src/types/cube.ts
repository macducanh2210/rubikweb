import type { ApiSuccess } from './api'
import type { SolvingMethod } from './settings'

export type Face = 'U' | 'D' | 'F' | 'B' | 'L' | 'R'
export type StickerColor = 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'orange'

export type FaceColors = [
  StickerColor, StickerColor, StickerColor,
  StickerColor, StickerColor, StickerColor,
  StickerColor, StickerColor, StickerColor,
]

export interface CubeState {
  U: FaceColors
  D: FaceColors
  F: FaceColors
  B: FaceColors
  L: FaceColors
  R: FaceColors
}

/** Trạng thái hiển thị khi người dùng chưa tô đủ các mảng dán. */
export type CubePreviewFaces = Partial<Record<Face, readonly (StickerColor | null | undefined)[]>>

/** multipart/form-data */
export interface DetectSingleFaceRequest {
  face: Face
  image: File
}

export interface DetectSingleFaceData {
  face_id: number
  face: Face
  image_url: string
  colors: FaceColors
  confidence_score: number
}

export type DetectSingleFaceResponse = ApiSuccess<DetectSingleFaceData>

export interface FinalizeFace {
  face: Face
  face_id: number
  colors: FaceColors | null
}

export interface DetectFinalizeRequest {
  faces: FinalizeFace[]
}

export interface DetectFinalizeData {
  rubik_state_id: number
  cube_state: CubeState
  confidence_score: number
}

export type DetectFinalizeResponse = ApiSuccess<DetectFinalizeData>

export interface DetectManualRequest {
  cube_state: CubeState
}

export type DetectManualResponse = ApiSuccess<DetectFinalizeData>

export interface SolveRequest {
  rubik_state_id: number
}

export interface SolveData {
  solution_id: number
  moves: string[]
  total_steps: number
  algorithm: SolvingMethod
}

export type SolveResponse = ApiSuccess<SolveData>
