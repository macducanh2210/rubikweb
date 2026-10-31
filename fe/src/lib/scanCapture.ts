import type { Face } from '../types'

export const captureOrder: readonly Face[] = ['F', 'R', 'B', 'L', 'U', 'D']

export function nextUncapturedFace(captures: Partial<Record<Face, unknown>>): Face | null {
  return captureOrder.find((face) => !captures[face]) ?? null
}
