import type { AnimationSpeed } from '../../types'
import { isCubeMove } from './index'

interface SpeedTiming {
  moveDurationMs: number
  gapMs: number
  startDelayMs: number
}

export const animationConfig: Record<AnimationSpeed, SpeedTiming> = {
  slow: { moveDurationMs: 3600, gapMs: 2000, startDelayMs: 3000 },
  normal: { moveDurationMs: 1300, gapMs: 1000, startDelayMs: 2000 },
  fast: { moveDurationMs: 1000, gapMs: 700, startDelayMs: 1500 },
}

const halfTurnDurationMultiplier = 1.5
const halfTurnPauseFraction = 0.2
export const turnGuideFlashMs = 180
export const maxSpeechWaitMs = 8000

export function moveDurationMs(move: string, speed: AnimationSpeed): number {
  if (!isCubeMove(move)) throw new Error(`Ký hiệu xoay không hợp lệ: ${move}`)
  return animationConfig[speed].moveDurationMs * (move.endsWith('2') ? halfTurnDurationMultiplier : 1)
}

/** Keep a 180° move within its 1.5× duration while showing two distinct 90° turns. */
export function splitHalfTurnDuration(durationMs: number): { quarterDurationMs: number; pauseMs: number } {
  const pauseMs = Math.round(durationMs * halfTurnPauseFraction)
  return { quarterDurationMs: (durationMs - pauseMs) / 2, pauseMs }
}

export function autoPauseMs(speed: AnimationSpeed, hasCompletedAutoMove: boolean): number {
  return hasCompletedAutoMove ? animationConfig[speed].gapMs : animationConfig[speed].startDelayMs
}

/** Duration of automatic playback, including the initial pause and gaps between moves. */
export function estimateSolutionDurationMs(moves: readonly string[], speed: AnimationSpeed): number {
  if (moves.length === 0) return 0
  const movesDuration = moves.reduce((total, move) => total + moveDurationMs(move, speed), 0)
  return animationConfig[speed].startDelayMs + movesDuration + (moves.length - 1) * animationConfig[speed].gapMs
}
