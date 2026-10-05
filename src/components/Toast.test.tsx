// #297 — one toast, bottom-centre, above the nav, with an optional Undo.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Toast } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('#297 — Toast', () => {
  it('announces politely, bottom-centre, clear of the nav', () => {
    render(<Toast message="Maya is in." visible onHide={vi.fn()} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Maya is in.')
    expect(toast.className).toContain('bottom-[var(--float-offset)]')
    expect(toast.className).toContain('left-1/2')
    expect(toast.className).toContain('z-[var(--z-toast)]')
  })

  it('offers Undo when given one, and hides once used', () => {
    const onUndo = vi.fn()
    const onHide = vi.fn()
    render(<Toast message="Maya is in." visible onHide={onHide} action={{ label: 'Undo', onClick: onUndo }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalled()
    expect(onHide).toHaveBeenCalled()
  })

  it('hides itself after a while', () => {
    vi.useFakeTimers()
    const onHide = vi.fn()
    render(<Toast message="Saved" visible onHide={onHide} />)
    act(() => vi.advanceTimersByTime(4000))
    expect(onHide).toHaveBeenCalled()
  })
})
