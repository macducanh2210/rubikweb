import { describe, expect, it } from 'vitest'
import type { CubeState, Face } from '../../types'
import { applyMove, type CubeMove } from './index'
import { animationTurn, faceletPose, rotatedFaceletPose, turnMarkerDirection, type FaceletPose } from './animationGeometry'

const faces: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const moves: CubeMove[] = faces.flatMap((face) => [face, `${face}'`, `${face}2`] as CubeMove[])
type LabeledState = Record<Face, string[]>

function poseKey({ position, normal }: FaceletPose): string {
  return `${position.join(',')};${normal.join(',')}`
}

const slots = faces.flatMap((face) => Array.from({ length: 9 }, (_, index) => ({ face, index, pose: faceletPose(face, index) })))
const slotByPose = new Map(slots.map((slot) => [poseKey(slot.pose), slot]))

function labeledState(): LabeledState {
  return Object.fromEntries(faces.map((face) => [face, Array.from({ length: 9 }, (_, index) => `${face}${index}`)])) as LabeledState
}

describe('hình học mảng dán dùng cho hoạt ảnh 3D', () => {
  it.each([
    ['U', 'F', [-1, 0]], ['D', 'F', [1, 0]],
    ['R', 'F', [0, 1]], ['L', 'F', [0, -1]],
    ['F', 'U', [1, 0]], ['B', 'U', [-1, 0]],
  ] as const)('%s chỉ đúng hướng dịch chuyển trên mặt %s', (move, face, expected) => {
    expect(turnMarkerDirection(face, move)).toEqual(expected)
    expect(turnMarkerDirection(face, `${move}'` as CubeMove)).toEqual(expected.map((value) => value === 0 ? 0 : -value))
    expect(turnMarkerDirection(face, `${move}2` as CubeMove)).toEqual(expected)
  })

  it('ánh xạ duy nhất 54 ô và đúng chiều các mặt theo quy ước chụp', () => {
    expect(slotByPose.size).toBe(54)
    expect(faceletPose('U', 0)).toEqual({ position: [-1, 1, -1], normal: [0, 1, 0] })
    expect(faceletPose('D', 0)).toEqual({ position: [-1, -1, 1], normal: [0, -1, 0] })
    expect(faceletPose('F', 0)).toEqual({ position: [-1, 1, 1], normal: [0, 0, 1] })
    expect(faceletPose('R', 0)).toEqual({ position: [1, 1, 1], normal: [1, 0, 0] })
    expect(faceletPose('B', 0)).toEqual({ position: [1, 1, -1], normal: [0, 0, -1] })
    expect(faceletPose('L', 0)).toEqual({ position: [-1, 1, -1], normal: [-1, 0, 0] })
  })

  it.each(moves)('%s xoay vị trí và pháp tuyến đúng như applyMove', (move) => {
    const initial = labeledState()
    const expected = applyMove(initial as unknown as CubeState, move) as unknown as LabeledState
    const fromGeometry = labeledState()
    for (const { face, index, pose } of slots) {
      const target = slotByPose.get(poseKey(rotatedFaceletPose(pose, move)))
      expect(target, `Không tìm thấy đích cho ${move} ${face}${index}`).toBeDefined()
      fromGeometry[target!.face][target!.index] = initial[face][index]
    }
    expect(fromGeometry).toEqual(expected)

    const { layer, angle } = animationTurn(move)
    expect(Math.abs(angle)).toBe(move.endsWith('2') ? Math.PI : Math.PI / 2)
    if (!move.endsWith('2')) {
      const outwardDirection = layer === 1 ? 1 : -1
      expect(Math.sign(angle) * outwardDirection).toBe(move.endsWith("'") ? 1 : -1)
    }
  })
})
