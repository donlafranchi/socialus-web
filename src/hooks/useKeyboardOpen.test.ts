// T113 — nav hides while the virtual keyboard is up.
// Trace: scenario F046 § Edge Cases "Keyboard open".

import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardOpen, KEYBOARD_MIN_INSET } from './useKeyboardOpen'

type FakeViewport = {
  height: number
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
  emit: () => void
}

function stubVisualViewport(height: number): FakeViewport {
  const listeners = new Set<() => void>()
  const vv: FakeViewport = {
    height,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    emit: () => listeners.forEach((fn) => fn()),
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  return vv
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  vi.restoreAllMocks()
})

describe('useKeyboardOpen', () => {
  it('is false when the platform exposes no visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('is false when the viewport fills the window', () => {
    stubVisualViewport(800)
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(false)
  })

  it('is true once the viewport shrinks past the keyboard inset', () => {
    const vv = stubVisualViewport(800)
    const { result } = renderHook(() => useKeyboardOpen())

    act(() => {
      vv.height = 800 - (KEYBOARD_MIN_INSET + 50)
      vv.emit()
    })
    expect(result.current).toBe(true)
  })

  it('ignores a small viewport change such as a collapsing browser chrome', () => {
    const vv = stubVisualViewport(800)
    const { result } = renderHook(() => useKeyboardOpen())

    act(() => {
      vv.height = 800 - (KEYBOARD_MIN_INSET - 10)
      vv.emit()
    })
    expect(result.current).toBe(false)
  })

  it('clears when the keyboard dismisses', () => {
    const vv = stubVisualViewport(800)
    const { result } = renderHook(() => useKeyboardOpen())

    act(() => {
      vv.height = 400
      vv.emit()
    })
    expect(result.current).toBe(true)

    act(() => {
      vv.height = 800
      vv.emit()
    })
    expect(result.current).toBe(false)
  })
})
