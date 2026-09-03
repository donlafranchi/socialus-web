// T115 — scroll restoration on back navigation (F045 § "Back navigation
// restores filters" — and scroll position).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useScrollRestoration } from './useScrollRestoration'

const KEY = 'explore'

beforeEach(() => {
  sessionStorage.clear()
  window.scrollY = 0
  vi.spyOn(window, 'scrollTo').mockImplementation((...args: unknown[]) => {
    const opts = args[0] as { top?: number } | number
    window.scrollY = typeof opts === 'number' ? (args[1] as number) : (opts?.top ?? 0)
  })
})
afterEach(() => {
  // Unmount first: a leaked hook keeps its scroll listener and would write
  // over the next test's stored position.
  cleanup()
  vi.restoreAllMocks()
})

async function scrollTo(y: number) {
  window.scrollY = y
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    // The listener is rAF-throttled; let the frame land before asserting.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  })
}

describe('useScrollRestoration', () => {
  it('does nothing until the content it would scroll to is ready', () => {
    renderHook(() => useScrollRestoration(KEY, false))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('records the scroll position once the content is ready', async () => {
    renderHook(() => useScrollRestoration(KEY, true))
    await scrollTo(420)
    expect(sessionStorage.getItem(`scroll:${KEY}`)).toBe('420')
  })

  it('restores the recorded position when the content becomes ready', () => {
    sessionStorage.setItem(`scroll:${KEY}`, '420')
    const { rerender } = renderHook(({ ready }) => useScrollRestoration(KEY, ready), {
      initialProps: { ready: false },
    })
    expect(window.scrollTo).not.toHaveBeenCalled()
    rerender({ ready: true })
    expect(window.scrollY).toBe(420)
  })

  it('restores only once, so a later scroll is not yanked back', async () => {
    sessionStorage.setItem(`scroll:${KEY}`, '420')
    const { rerender } = renderHook(({ ready }) => useScrollRestoration(KEY, ready), {
      initialProps: { ready: true },
    })
    expect(window.scrollY).toBe(420)
    await scrollTo(0)
    rerender({ ready: true })
    expect(window.scrollY).toBe(0)
  })

  it('does not clobber the stored position with 0 before it restores', async () => {
    sessionStorage.setItem(`scroll:${KEY}`, '420')
    renderHook(() => useScrollRestoration(KEY, false))
    await scrollTo(0)
    expect(sessionStorage.getItem(`scroll:${KEY}`)).toBe('420')
  })

  it('survives a sessionStorage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => renderHook(() => useScrollRestoration(KEY, true))).not.toThrow()
    spy.mockRestore()
  })
})
