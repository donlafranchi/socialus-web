// T113 — scroll direction drives bottom-nav visibility.
// Trace: planning/next/scenario-F046-member-scrolls-and-nav-hides.md.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollDirection, NAV_SCROLL_THRESHOLD } from './useScrollDirection'

let scrollY = 0

function scrollTo(y: number) {
  act(() => {
    scrollY = y
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  scrollY = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  // Run rAF callbacks synchronously so scroll assertions are deterministic.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useScrollDirection', () => {
  it('is visible on first render — no flash of hidden nav', () => {
    const { result } = renderHook(() => useScrollDirection())
    expect(result.current).toBe(true)
  })

  it('exposes a 20px threshold', () => {
    expect(NAV_SCROLL_THRESHOLD).toBe(20)
  })

  it('hides once downward travel passes the threshold', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(200)
    expect(result.current).toBe(false)
  })

  it('ignores micro-scrolls below the threshold', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(15)
    expect(result.current).toBe(true)
  })

  it('accumulates small same-direction scrolls up to the threshold', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(8)
    scrollTo(16)
    expect(result.current).toBe(true)
    scrollTo(24)
    expect(result.current).toBe(false)
  })

  it('reappears once upward travel passes the threshold', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(400)
    expect(result.current).toBe(false)
    scrollTo(360)
    expect(result.current).toBe(true)
  })

  it('does not flicker on a small direction reversal', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(400)
    expect(result.current).toBe(false)
    scrollTo(390) // 10px back up — below threshold
    expect(result.current).toBe(false)
    scrollTo(398) // jitter back down
    expect(result.current).toBe(false)
  })

  it('is visible again at the top of the page', () => {
    const { result } = renderHook(() => useScrollDirection())
    scrollTo(400)
    expect(result.current).toBe(false)
    scrollTo(0)
    expect(result.current).toBe(true)
  })

  it('freezes visibility while paused', () => {
    const { result, rerender } = renderHook(({ paused }) => useScrollDirection({ paused }), {
      initialProps: { paused: false },
    })
    scrollTo(400)
    expect(result.current).toBe(false)

    rerender({ paused: true })
    scrollTo(100) // a big scroll up that would normally reveal the nav
    expect(result.current).toBe(false)

    rerender({ paused: false })
    scrollTo(60)
    expect(result.current).toBe(true)
  })

  it('does not jump when scrolling resumes after a pause', () => {
    const { result, rerender } = renderHook(({ paused }) => useScrollDirection({ paused }), {
      initialProps: { paused: false },
    })
    rerender({ paused: true })
    scrollTo(2000)
    rerender({ paused: false })
    scrollTo(2010) // only 10px of real travel since the pause lifted
    expect(result.current).toBe(true)
  })

  it('resets to visible when the reset key changes — nav returns on tab switch', () => {
    const { result, rerender } = renderHook(({ resetKey }) => useScrollDirection({ resetKey }), {
      initialProps: { resetKey: '/' },
    })
    scrollTo(400)
    expect(result.current).toBe(false)

    rerender({ resetKey: '/explore' })
    expect(result.current).toBe(true)
  })

  it('honours a custom threshold', () => {
    const { result } = renderHook(() => useScrollDirection({ threshold: 100 }))
    scrollTo(60)
    expect(result.current).toBe(true)
    scrollTo(160)
    expect(result.current).toBe(false)
  })

  it('registers a passive scroll listener and removes it on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useScrollDirection())

    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))

    add.mockRestore()
    remove.mockRestore()
  })
})
