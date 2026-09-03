// T113 — nav visibility is shared state so the F045 pill row can read it (T114).
// Trace: scenario F046 § "Resolved — Kind-filter pills on Explore".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { NavVisibilityProvider, useNavVisible } from './NavVisibilityProvider'

const pathname = { current: '/' }
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}))

let scrollY = 0

function Probe() {
  return <span data-testid="probe">{String(useNavVisible())}</span>
}

const probe = () => screen.getByTestId('probe').textContent

function scrollTo(y: number) {
  act(() => {
    scrollY = y
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  scrollY = 0
  pathname.current = '/'
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('NavVisibilityProvider', () => {
  it('defaults to visible outside a provider', () => {
    render(<Probe />)
    expect(probe()).toBe('true')
  })

  it('publishes the scroll-driven visibility to consumers', () => {
    render(
      <NavVisibilityProvider>
        <Probe />
      </NavVisibilityProvider>,
    )
    expect(probe()).toBe('true')
    scrollTo(400)
    expect(probe()).toBe('false')
    scrollTo(300)
    expect(probe()).toBe('true')
  })

  it('holds visibility steady while a modal is open', async () => {
    render(
      <NavVisibilityProvider>
        <Probe />
      </NavVisibilityProvider>,
    )
    scrollTo(400)
    expect(probe()).toBe('false')

    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    await act(async () => {
      document.body.appendChild(dialog)
      await Promise.resolve()
    })

    scrollTo(0)
    expect(probe()).toBe('false')
  })

  it('hides the nav while the virtual keyboard is open', () => {
    const listeners = new Set<() => void>()
    const vv = {
      height: 800,
      addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    render(
      <NavVisibilityProvider>
        <Probe />
      </NavVisibilityProvider>,
    )
    expect(probe()).toBe('true')

    act(() => {
      vv.height = 400
      listeners.forEach((fn) => fn())
    })
    expect(probe()).toBe('false')

    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  })

  it('restores the nav on a route change', () => {
    const { rerender } = render(
      <NavVisibilityProvider>
        <Probe />
      </NavVisibilityProvider>,
    )
    scrollTo(400)
    expect(probe()).toBe('false')

    pathname.current = '/explore'
    rerender(
      <NavVisibilityProvider>
        <Probe />
      </NavVisibilityProvider>,
    )
    expect(probe()).toBe('true')
  })
})
