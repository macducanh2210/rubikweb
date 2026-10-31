import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPracticeKeyboardHandlers, type PracticeTimerPhase } from './practiceKeyboard'

class FocusTarget {
  constructor(private tag: string) {}
  closest(selector: string) {
    return selector.split(', ').includes(this.tag) ? this : null
  }
}

function keyEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    code: 'Space', key: ' ', repeat: false, isComposing: false,
    altKey: false, ctrlKey: false, metaKey: false, target: null,
    preventDefault: vi.fn(), ...overrides,
  } as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

function timer(initialPhase: PracticeTimerPhase = 'ready') {
  let phase = initialPhase
  const actions = {
    getPhase: () => phase,
    armTimer: vi.fn(() => { phase = 'holding' }),
    startTimer: vi.fn(() => { phase = 'running' }),
    stopTimer: vi.fn(() => { phase = 'saving' }),
    cancelArm: vi.fn(() => { if (phase === 'holding') phase = 'ready' }),
  }
  return { ...actions, ...createPracticeKeyboardHandlers(actions), setPhase: (next: PracticeTimerPhase) => { phase = next } }
}

describe('Space trên trang luyện tập', () => {
  beforeEach(() => {
    vi.stubGlobal('Element', FocusTarget)
    vi.stubGlobal('document', { querySelector: vi.fn(() => null) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(['a', 'button', 'summary', 'body'])('bắt đầu được khi focus ở %s, không cần bấm đồng hồ', (tag) => {
    const controls = timer()
    const down = keyEvent({ target: new FocusTarget(tag) as unknown as EventTarget })
    const up = keyEvent()
    controls.onKeyDown(down)
    expect(controls.getPhase()).toBe('holding')
    controls.onKeyUp(up)
    expect(controls.getPhase()).toBe('running')
    expect(down.preventDefault).toHaveBeenCalledOnce()
    expect(up.preventDefault).toHaveBeenCalledOnce()
  })

  it('chặn cuộn ở mọi lần lặp khi giữ Space, chỉ chuẩn bị một lần', () => {
    const controls = timer()
    controls.onKeyDown(keyEvent())
    for (let index = 0; index < 10; index += 1) {
      const repeat = keyEvent({ repeat: true })
      controls.onKeyDown(repeat)
      expect(repeat.preventDefault).toHaveBeenCalledOnce()
    }
    expect(controls.armTimer).toHaveBeenCalledOnce()
    expect(controls.startTimer).not.toHaveBeenCalled()
    controls.onKeyUp(keyEvent())
    expect(controls.startTimer).toHaveBeenCalledOnce()
  })

  it('dừng một lần, không khởi động lượt mới nếu lưu xong khi Space vẫn còn giữ', () => {
    const controls = timer('running')
    controls.onKeyDown(keyEvent())
    expect(controls.stopTimer).toHaveBeenCalledOnce()
    controls.setPhase('ready')
    const repeat = keyEvent({ repeat: true })
    controls.onKeyDown(repeat)
    controls.onKeyUp(keyEvent())
    expect(repeat.preventDefault).toHaveBeenCalledOnce()
    expect(controls.armTimer).not.toHaveBeenCalled()
    expect(controls.startTimer).not.toHaveBeenCalled()
    controls.onKeyDown(keyEvent())
    controls.onKeyUp(keyEvent())
    expect(controls.startTimer).toHaveBeenCalledOnce()
  })

  it.each(['saving', 'save-error'] as const)('chặn cuộn khi đang %s mà không đổi trạng thái', (phase) => {
    const controls = timer(phase)
    const down = keyEvent()
    controls.onKeyDown(down)
    controls.onKeyUp(keyEvent())
    expect(down.preventDefault).toHaveBeenCalledOnce()
    expect(controls.getPhase()).toBe(phase)
  })

  it.each(['input', 'textarea', 'select', '[contenteditable]', '[role="textbox"]'])('không chiếm Space trong %s', (tag) => {
    const controls = timer()
    const event = keyEvent({ target: new FocusTarget(tag) as unknown as EventTarget })
    controls.onKeyDown(event)
    controls.onKeyUp(keyEvent())
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(controls.getPhase()).toBe('ready')
  })

  it('không chiếm Space trong hộp thoại', () => {
    vi.stubGlobal('document', { querySelector: () => ({}) })
    const controls = timer()
    const event = keyEvent()
    controls.onKeyDown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(controls.armTimer).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { code: 'Enter', key: 'Enter' }])('không chiếm phím khác hoặc tổ hợp phím: %j', (overrides) => {
    const controls = timer()
    const event = keyEvent(overrides)
    controls.onKeyDown(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(controls.armTimer).not.toHaveBeenCalled()
  })

  it('hủy chuẩn bị khi rời cửa sổ; thả Space sau đó không bắt đầu đồng hồ', () => {
    const controls = timer()
    controls.onKeyDown(keyEvent())
    controls.onBlur()
    controls.onKeyUp(keyEvent())
    expect(controls.getPhase()).toBe('ready')
    expect(controls.startTimer).not.toHaveBeenCalled()
  })
})
