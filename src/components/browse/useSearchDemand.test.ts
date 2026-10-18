// #909 — Explore counts a search once it has settled, not on every keystroke.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useSearchDemand, SEARCH_SETTLE_MS } from './useSearchDemand'

const log = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  log.mockReset()
  log.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type P = { q: string; n: number; metro: string | null; area: string | null; failed?: boolean }
const mount = (p: P) =>
  renderHook((x: P) => useSearchDemand({ query: x.q, resultCount: x.n, metroSlug: x.metro, areaId: x.area, failed: x.failed ?? false, log }), { initialProps: p })

describe('useSearchDemand', () => {
  it('logs once the typing has stopped, with the count it settled on', () => {
    const h = mount({ q: 'ta', n: 9, metro: 'sacramento', area: null })
    h.rerender({ q: 'tac', n: 4, metro: 'sacramento', area: null })
    h.rerender({ q: 'tacos', n: 2, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS - 1)
    expect(log).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('tacos', 'sacramento', null, 2)
  })

  it('does not log the same search twice in one visit, or a cleared box', () => {
    const h = mount({ q: 'tacos', n: 2, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    h.rerender({ q: 'tacos', n: 3, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    h.rerender({ q: '', n: 30, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('ignores a single character and a failed load', () => {
    const h = mount({ q: 't', n: 0, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    h.rerender({ q: 'tacos', n: 0, metro: 'sacramento', area: null, failed: true })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(log).not.toHaveBeenCalled()
  })

  it('a new area is a new search', () => {
    const h = mount({ q: 'tacos', n: 2, metro: 'sacramento', area: null })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    h.rerender({ q: 'tacos', n: 1, metro: 'sacramento', area: 'midtown' })
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(log).toHaveBeenLastCalledWith('tacos', 'sacramento', 'midtown', 1)
  })
})
