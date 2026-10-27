import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AppHeader } from './AppHeader'

const auth = { user: null as { email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
const pathname = { current: '/explore' }
const router = { back: vi.fn(), push: vi.fn() }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current, useRouter: () => router }))

afterEach(() => {
  cleanup()
  auth.user = null
  auth.loading = false
  pathname.current = '/explore'
  vi.clearAllMocks()
})

describe('AppHeader (#1094)', () => {
  it('has no bottom bar and no tabs', () => {
    render(<AppHeader />)
    expect(screen.queryByTestId('bottom-nav')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create' })).toBeNull()
  })

  it('signed out, the top right says Sign in', () => {
    render(<AppHeader />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login')
  })

  it('signed in, the top right is a labelled avatar that opens /you', () => {
    auth.user = { email: 'sam@example.com' }
    render(<AppHeader />)
    expect(screen.getByRole('link', { name: 'You' })).toHaveAttribute('href', '/you')
  })

  it('waits for auth instead of flashing Sign in at someone who is signed in', () => {
    auth.loading = true
    render(<AppHeader />)
    expect(screen.queryByText('Sign in')).toBeNull()
  })

  it('Explore is home: no back button there', () => {
    render(<AppHeader />)
    expect(screen.queryByTestId('header-back')).toBeNull()
  })

  it('elsewhere there is a Back button that goes back', () => {
    pathname.current = '/g/abc'
    window.history.pushState({}, '', '/a')
    window.history.pushState({}, '', '/g/abc')
    render(<AppHeader />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(router.back).toHaveBeenCalled()
  })

  it('is hidden on sign-in and the edit screen', () => {
    pathname.current = '/auth/login'
    const { container } = render(<AppHeader />)
    expect(container).toBeEmptyDOMElement()
  })
})
