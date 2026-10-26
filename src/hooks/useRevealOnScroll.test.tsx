// #791 — Explore renders its list a screenful at a time: 194 cards on every render made each tap wait.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useRevealOnScroll, REVEAL_STEP } from './useRevealOnScroll'

let observed: { cb: IntersectionObserverCallback; el: Element }[] = []
class FakeObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    observed.push({ cb: this.cb, el })
  }
  disconnect() {
    observed = observed.filter((o) => o.cb !== this.cb)
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

function nearEnd() {
  act(() => {
    for (const o of [...observed]) o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver)
  })
}

function List({ total, reset = '' }: { total: number; reset?: string }) {
  const { shown, sentinel } = useRevealOnScroll('explore', total, reset)
  return (
    <>
      <p data-testid="shown">{shown}</p>
      {shown < total && <div ref={sentinel} data-testid="sentinel" />}
    </>
  )
}

beforeEach(() => {
  observed = []
  sessionStorage.clear()
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useRevealOnScroll', () => {
  it('starts with one step, not the whole list', () => {
    render(<List total={194} />)
    expect(screen.getByTestId('shown')).toHaveTextContent(String(REVEAL_STEP))
  })

  it('adds a step as the end nears, until everything is shown', () => {
    render(<List total={REVEAL_STEP * 2 + 5} />)
    nearEnd()
    expect(screen.getByTestId('shown')).toHaveTextContent(String(REVEAL_STEP * 2))
    nearEnd()
    expect(screen.getByTestId('shown')).toHaveTextContent(String(REVEAL_STEP * 2 + 5))
    expect(screen.queryByTestId('sentinel')).toBeNull()
  })

  it('comes back as deep as the visitor went, so the scroll position can be restored', () => {
    const first = render(<List total={194} />)
    nearEnd()
    nearEnd()
    first.unmount()
    render(<List total={194} />)
    expect(screen.getByTestId('shown')).toHaveTextContent(String(REVEAL_STEP * 3))
  })

  it('starts over when the list itself changes (a filter or a search)', () => {
    const { rerender } = render(<List total={194} reset="a" />)
    nearEnd()
    rerender(<List total={194} reset="b" />)
    expect(screen.getByTestId('shown')).toHaveTextContent(String(REVEAL_STEP))
  })

  it('shows everything where the browser cannot watch the scroll', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<List total={194} />)
    expect(screen.getByTestId('shown')).toHaveTextContent('194')
  })
})
