// F121 criterion 11 — what a shelf counts, from the browser.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'

const log = vi.fn()
vi.mock('@/app/_actions/shelf-actions', () => ({ logShelfAction: (...a: unknown[]) => log(...a) }))
import { LoggedShelf, ShelfSaveCredit } from './ShelfLogging'

let seen: ((e: { isIntersecting: boolean; intersectionRatio: number }[]) => void) | null = null
beforeEach(() => {
  vi.useFakeTimers()
  log.mockReset()
  sessionStorage.clear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof seen) {
        seen = cb
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('F121 — counting a shelf in the browser', () => {
  it('an impression after half the shelf has been on screen for a second, not a glance', () => {
    render(<LoggedShelf logId="next-7-days"><a href="/p">card</a></LoggedShelf>)
    act(() => seen!([{ isIntersecting: true, intersectionRatio: 0.6 }]))
    act(() => vi.advanceTimersByTime(500))
    act(() => seen!([{ isIntersecting: false, intersectionRatio: 0 }]))
    act(() => vi.advanceTimersByTime(2000))
    expect(log).not.toHaveBeenCalled()
    act(() => seen!([{ isIntersecting: true, intersectionRatio: 0.5 }]))
    act(() => vi.advanceTimersByTime(1000))
    expect(log).toHaveBeenCalledWith('next-7-days', 'impression')
  })

  it('a tap on a card counts, and a save on that card’s page later credits the shelf', () => {
    const { getByText } = render(
      <>
        <ShelfSaveCredit />
        <LoggedShelf logId="lend-a-hand"><a href={window.location.pathname}>card</a></LoggedShelf>
        <button type="button" data-shelf-save>Follow</button>
        <button type="button">Other</button>
      </>,
    )
    fireEvent.click(getByText('card'))
    expect(log).toHaveBeenCalledWith('lend-a-hand', 'tap')
    fireEvent.click(getByText('Other'))
    expect(log).not.toHaveBeenCalledWith('lend-a-hand', 'save')
    fireEvent.click(getByText('Follow'))
    expect(log).toHaveBeenCalledWith('lend-a-hand', 'save')
  })
})
