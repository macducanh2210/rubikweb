import { isCubeMove, type CubeMove } from './index'

const faceNames: Record<CubeMove[0], string> = {
  U: 'trên', D: 'dưới', F: 'trước', B: 'sau', L: 'trái', R: 'phải',
}

export function describeMoveForSpeech(move: string, undo = false): string {
  if (!isCubeMove(move)) throw new Error(`Ký hiệu xoay không hợp lệ: ${move}`)
  const face = faceNames[move[0] as CubeMove[0]]
  const direction = move.endsWith('2') ? 'xoay hai lần'
    : move.endsWith("'") ? 'xoay ngược chiều kim đồng hồ'
      : 'xoay thuận chiều kim đồng hồ'
  return `${undo ? 'Quay lại bước trước. ' : ''}Mặt ${face}, ${direction}.`
}
