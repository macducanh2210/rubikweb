/** The chip to highlight while moving one step forward or undoing one step. */
export function movingStepIndex(completedSteps: number, targetSteps: number): number {
  if (targetSteps === completedSteps + 1) return completedSteps
  if (targetSteps === completedSteps - 1) return targetSteps
  throw new Error('Chỉ có thể di chuyển một bước mỗi lần')
}
