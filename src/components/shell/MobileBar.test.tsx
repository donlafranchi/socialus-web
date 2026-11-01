import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MobileBar } from './MobileBar'
import { GlobalMobileBar } from './GlobalMobileBar'

const auth = { user: null as { id: string; email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages: async () => [] }))
const router = { push: vi.fn(), back: vi.fn() }
const pathname = { current: '/g/abc' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current, useRouter: () => router }))

beforeEach(() => {
  auth.user = null
  pathname.current = '/g/abc'
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const base = { query: '', onQueryChange: vi.fn() }

describe('MobileBar (#1141)', () => {
  it('is Safari-shaped: Back, Forward, a search field, ⋯ — phones only', () => {
    render(<MobileBar {...base} />)
    const bar = screen.getByTestId('mobile-bar')
    expect(bar.className).toContain('md:hidden')
    const order = ['bar-back', 'bar-forward', 'bar-search-input', 'bar-more'].map((id) => screen.getByTestId(id))
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('Forward is greyed out until Back has been used', () => {
    render(<MobileBar {...base} />)
    expect(screen.getByTestId('bar-forward')).toBeDisabled()
    window.history.pushState({}, '', '/a')
    window.history.pushState({}, '', '/b')
    fireEvent.click(screen.getByTestId('bar-back'))
    expect(router.back).toHaveBeenCalled()
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('bar-forward')).not.toBeDisabled()
  })

  it('Area and Filters buttons appear only when the screen supplies them', () => {
    const { rerender } = render(<MobileBar {...base} />)
    expect(screen.queryByTestId('bar-area')).toBeNull()
    expect(screen.queryByTestId('bar-filter')).toBeNull()
    const open = vi.fn()
    rerender(<MobileBar {...base} onOpenScope={open} onOpenFilters={open} filtersActive />)
    fireEvent.click(screen.getByTestId('bar-area'))
    fireEvent.click(screen.getByTestId('bar-filter'))
    expect(open).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('bar-filter-dot')).toBeInTheDocument()
    expect(screen.getByTestId('bar-filter')).toHaveAccessibleName('Open filters — filters applied')
  })

  it('⋯ signed out offers Sign in only; signed in it offers Create and You', () => {
    render(<MobileBar {...base} />)
    fireEvent.click(screen.getByTestId('bar-more'))
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByTestId('bar-menu-create')).toBeNull()
    expect(screen.getByTestId('bar-menu-you')).toHaveAttribute('href', '/auth/login')
    cleanup()
    auth.user = { id: 'm', email: 'a@b.c' }
    render(<MobileBar {...base} />)
    fireEvent.click(screen.getByTestId('bar-more'))
    expect(screen.getByTestId('bar-menu-you')).toHaveAttribute('href', '/you')
    fireEvent.click(screen.getByTestId('bar-menu-create'))
    expect(screen.getByRole('dialog', { name: 'Create' })).toBeInTheDocument()
  })

  it('the List/Map switch is in ⋯ only when the screen has one', () => {
    render(<MobileBar {...base} />)
    fireEvent.click(screen.getByTestId('bar-more'))
    expect(screen.queryByTestId('bar-menu-view')).toBeNull()
    cleanup()
    const onViewChange = vi.fn()
    render(<MobileBar {...base} view="list" onViewChange={onViewChange} />)
    fireEvent.click(screen.getByTestId('bar-more'))
    fireEvent.click(screen.getByTestId('bar-menu-view'))
    expect(onViewChange).toHaveBeenCalledWith('map')
  })
})

describe('GlobalMobileBar (#1141)', () => {
  it('sends the words to Explore on Enter', () => {
    render(<GlobalMobileBar />)
    fireEvent.change(screen.getByTestId('bar-search-input'), { target: { value: 'rye bread' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(router.push).toHaveBeenCalledWith('/explore?q=rye%20bread')
  })

  it('is absent on Explore (which brings its own) and on sign-in', () => {
    for (const p of ['/explore', '/auth/login']) {
      pathname.current = p
      const { container } = render(<GlobalMobileBar />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })
})
