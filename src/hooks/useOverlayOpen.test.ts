// T113 — nav auto-hide pauses while a modal or bottom sheet is open.
// Trace: scenario F046 § Edge Cases "Modal / bottom sheet open".

import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOverlayOpen } from './useOverlayOpen'

afterEach(() => {
  document.body.innerHTML = ''
})

async function flushObserver() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useOverlayOpen', () => {
  it('is false with no overlay mounted', () => {
    const { result } = renderHook(() => useOverlayOpen())
    expect(result.current).toBe(false)
  })

  it('is true when a modal is already mounted', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)

    const { result } = renderHook(() => useOverlayOpen())
    expect(result.current).toBe(true)
  })

  it('reacts to an overlay opening and closing', async () => {
    const { result } = renderHook(() => useOverlayOpen())
    expect(result.current).toBe(false)

    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    act(() => {
      document.body.appendChild(dialog)
    })
    await flushObserver()
    expect(result.current).toBe(true)

    act(() => {
      dialog.remove()
    })
    await flushObserver()
    expect(result.current).toBe(false)
  })

  it('honours an explicit data-nav-pause opt-in for non-dialog sheets', async () => {
    const { result } = renderHook(() => useOverlayOpen())
    const sheet = document.createElement('div')
    sheet.setAttribute('data-nav-pause', 'true')
    act(() => {
      document.body.appendChild(sheet)
    })
    await flushObserver()
    expect(result.current).toBe(true)
  })
})
