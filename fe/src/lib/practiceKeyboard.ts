export type PracticeTimerPhase = 'ready' | 'holding' | 'running' | 'saving' | 'save-error'

interface PracticeKeyboardOptions {
  getPhase: () => PracticeTimerPhase
  armTimer: () => void
  startTimer: () => void
  stopTimer: () => void
  cancelArm: () => void
}

function isSpace(event: KeyboardEvent): boolean {
  return event.code === 'Space' || event.key === ' '
}

function isBlocked(event: KeyboardEvent): boolean {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return true
  if (document.querySelector('dialog[open], [role="dialog"]')) return true
  return event.target instanceof Element && Boolean(
    event.target.closest('input, textarea, select, [contenteditable], [role="textbox"]'),
  )
}

export function createPracticeKeyboardHandlers(options: PracticeKeyboardOptions) {
  let spaceHeld = false

  function onKeyDown(event: KeyboardEvent) {
    if (!isSpace(event) || (!spaceHeld && isBlocked(event))) return
    // Repeated keydowns must also be cancelled, or holding Space scrolls the page.
    event.preventDefault()
    if (event.repeat || spaceHeld) return
    spaceHeld = true
    if (options.getPhase() === 'ready') options.armTimer()
    else if (options.getPhase() === 'running') options.stopTimer()
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!isSpace(event) || !spaceHeld) return
    event.preventDefault()
    spaceHeld = false
    if (options.getPhase() === 'holding') options.startTimer()
  }

  function onBlur() {
    spaceHeld = false
    options.cancelArm()
  }

  return { onKeyDown, onKeyUp, onBlur }
}
