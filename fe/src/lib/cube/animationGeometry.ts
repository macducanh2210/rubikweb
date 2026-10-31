import type { Face } from '../../types'
import { faceletPosition, type CubeMove } from './index'

export type Axis = 'x' | 'y' | 'z'
export type Vector3 = readonly [number, number, number]
export interface FaceletPose { position: Vector3; normal: Vector3 }

const faceLayer: Record<CubeMove[0], { axis: Axis; layer: 1 | -1 }> = {
  R: { axis: 'x', layer: 1 }, L: { axis: 'x', layer: -1 },
  U: { axis: 'y', layer: 1 }, D: { axis: 'y', layer: -1 },
  F: { axis: 'z', layer: 1 }, B: { axis: 'z', layer: -1 },
}

/** Geometry used to place a sticker on a cubelet and to check animated turns. */
export function faceletPose(face: Face, index: number): FaceletPose {
  return faceletPosition(face, index)
}

/** Exact signed world-axis rotation used by the Three.js animation. */
export function animationTurn(move: CubeMove): { axis: Axis; layer: 1 | -1; angle: number } {
  const { axis, layer } = faceLayer[move[0] as CubeMove[0]]
  const inverse = move.endsWith("'") ? -1 : 1
  const turns = move.endsWith('2') ? 2 : 1
  return { axis, layer, angle: (layer === 1 ? -1 : 1) * inverse * turns * Math.PI / 2 }
}

/** Direction of an adjacent face's moving stickers in that face's reading orientation. */
export function turnMarkerDirection(face: Face, move: CubeMove): readonly [number, number] | null {
  const { axis, angle } = animationTurn(move)
  const normal = faceletPose(face, 4).normal
  const sign = Math.sign(angle)
  const signedAxis: Vector3 = axis === 'x' ? [sign, 0, 0] : axis === 'y' ? [0, sign, 0] : [0, 0, sign]
  const velocity: Vector3 = [
    signedAxis[1] * normal[2] - signedAxis[2] * normal[1],
    signedAxis[2] * normal[0] - signedAxis[0] * normal[2],
    signedAxis[0] * normal[1] - signedAxis[1] * normal[0],
  ]
  const center = faceletPose(face, 4).position
  const right = faceletPose(face, 5).position.map((value, index) => value - center[index])
  const up = faceletPose(face, 1).position.map((value, index) => value - center[index])
  const horizontal = Math.sign(velocity.reduce((sum, value, index) => sum + value * right[index], 0))
  const vertical = Math.sign(velocity.reduce((sum, value, index) => sum + value * up[index], 0))
  return horizontal || vertical ? [horizontal, vertical] : null
}

function rotateQuarter([x, y, z]: Vector3, axis: Axis, direction: 1 | -1): Vector3 {
  if (axis === 'x') return direction === 1 ? [x, -z, y] : [x, z, -y]
  if (axis === 'y') return direction === 1 ? [z, y, -x] : [-z, y, x]
  return direction === 1 ? [-y, x, z] : [y, -x, z]
}

/** Discrete pose after the animation reaches its target angle. */
export function rotatedFaceletPose(pose: FaceletPose, move: CubeMove): FaceletPose {
  const { axis, layer, angle } = animationTurn(move)
  const axisIndex = { x: 0, y: 1, z: 2 }[axis]
  if (pose.position[axisIndex] !== layer) return pose
  const direction: 1 | -1 = angle > 0 ? 1 : -1
  const turns = move.endsWith('2') ? 2 : 1
  let position = pose.position
  let normal = pose.normal
  for (let index = 0; index < turns; index += 1) {
    position = rotateQuarter(position, axis, direction)
    normal = rotateQuarter(normal, axis, direction)
  }
  return { position, normal }
}
