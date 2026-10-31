import { describe, expect, it } from 'vitest'
import { applyMoves } from './index'
import { createManualCubeDraft, manualColors, manualCubeStats, paintManualSticker, rotateManualFace, validateManualCube } from './manualInput'
import { solvedPracticeCube } from './practice'

describe('nhập màu sáu mặt', () => {
  it('chỉ gợi ý sáu ô tâm, không tự tô các ô còn thiếu', () => {
    const draft = createManualCubeDraft()
    expect(manualCubeStats(draft).missingCount).toBe(48)
    expect(manualCubeStats(draft).distinctCenters).toBe(true)
    expect(Object.values(manualCubeStats(draft).counts)).toEqual([1, 1, 1, 1, 1, 1])
    expect(validateManualCube(draft).cubeState).toBeNull()
  })

  it('giữ màu đã quét và không thay đổi mảng nguồn khi tô hoặc xoay', () => {
    const source = applyMoves(solvedPracticeCube(), ['F', 'R', "U'"])
    const before = structuredClone(source)
    const draft = createManualCubeDraft({ F: source.F })
    expect(draft.F).toEqual(source.F)
    expect(manualCubeStats(draft).missingCount).toBe(40)
    paintManualSticker(draft, 'F', 0, 'white')
    rotateManualFace(draft, 'F')
    expect(source).toEqual(before)
    expect(draft.F).toEqual(source.F)
  })

  it('không ép tâm về màu mặc định khi người dùng có tư thế khối khác', () => {
    const draft = createManualCubeDraft({ U: ['yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow', 'yellow'] })
    expect(draft.U[4]).toBe('yellow')
  })

  it('cho sửa ô tâm và báo trùng tâm dù tổng mỗi màu đủ 9', () => {
    const draft = createManualCubeDraft(solvedPracticeCube())
    const changed = paintManualSticker(paintManualSticker(draft, 'F', 4, 'red'), 'R', 0, 'green')
    expect(manualColors.every((color) => manualCubeStats(changed).counts[color] === 9)).toBe(true)
    expect(validateManualCube(changed).error).toContain('Sáu ô tâm')
    expect(draft.F[4]).toBe('green')
  })

  it('báo thừa/thiếu màu trước khi gọi máy chủ', () => {
    const draft = paintManualSticker(createManualCubeDraft(solvedPracticeCube()), 'F', 0, 'red')
    expect(manualCubeStats(draft).counts.red).toBe(10)
    expect(manualCubeStats(draft).counts.green).toBe(8)
    expect(validateManualCube(draft).error).toContain('đúng 9 ô')
  })

  it('chấp nhận khối xáo hợp lệ và trả bản sao độc lập để gửi API', () => {
    const state = applyMoves(solvedPracticeCube(), ['B2', 'L', "D'", 'F2', 'R'])
    const draft = createManualCubeDraft(state)
    const result = validateManualCube(draft)
    expect(result.error).toBeNull()
    expect(result.cubeState).toEqual(state)
    result.cubeState!.F[0] = 'white'
    expect(draft.F).toEqual(state.F)
  })

  it('xoay mặt theo chiều kim đồng hồ, giữ tâm và trở lại sau bốn lần', () => {
    const draft = createManualCubeDraft()
    draft.F = ['red', 'orange', 'yellow', 'green', 'blue', 'white', null, 'red', 'orange']
    const turned = rotateManualFace(draft, 'F')
    expect(turned.F).toEqual([null, 'green', 'red', 'red', 'blue', 'orange', 'orange', 'white', 'yellow'])
    expect(rotateManualFace(rotateManualFace(rotateManualFace(turned, 'F'), 'F'), 'F')).toEqual(draft)
  })
})
