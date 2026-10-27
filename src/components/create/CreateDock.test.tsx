import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CreateDock } from './CreateDock'

const auth = { user: null as { id: string; email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const own = vi.fn()
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages: (...a: unknown[]) => own(...a) }))
const pathname = { current: '/explore' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

const page = (name: string, href: string, lifecycleState = 'active') => ({ name, href, lifecycleState })

afterEach(() => {
  cleanup()
  auth.user = null
  pathname.current = '/explore'
  own.mockReset()
})

const openSheet = () => fireEvent.click(screen.getByTestId('create-fab'))

describe('CreateDock (#1094)', () => {
  it('is one labelled 56px round button, with room beside it', () => {
    render(<CreateDock />)
    const fab = screen.getByRole('button', { name: 'Create' })
    expect(fab.className).toContain('size-[var(--dock-size)]')
    expect(fab.className).toContain('rounded-full')
    const dock = screen.getByTestId('create-dock')
    expect(dock.className).toContain('justify-end')
    expect(dock.className).toContain('--float-offset')
  })

  it('opens a dialog offering Post, Event, Page and Wonder', () => {
    render(<CreateDock />)
    openSheet()
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    for (const n of ['Post', 'Event', 'Page', 'Wonder']) expect(within(dialog).getByText(n)).toBeInTheDocument()
  })

  it('with no Page yet, Post leads to creating one first and says why', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([])
    render(<CreateDock />)
    openSheet()
    await waitFor(() => expect(screen.getByText(/Start one first/)).toBeInTheDocument())
    expect(screen.getByTestId('create-post')).toHaveAttribute('href', '/create')
  })

  it('with one Page, Post opens its composer and a draft is not offered', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([page('Sac', '/g/abc'), page('Draft', '/g/zzz', 'draft')])
    render(<CreateDock />)
    openSheet()
    await waitFor(() => expect(screen.getByTestId('create-post')).toHaveAttribute('href', '/g/abc#announce'))
    expect(screen.getByTestId('create-wonder')).toHaveAttribute('href', '/g/abc?compose=wonder#announce')
  })

  it('with several Pages, Post asks which Page', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([page('Sac', '/g/abc'), page('Bakery', '/g/def')])
    render(<CreateDock />)
    openSheet()
    await waitFor(() => expect(screen.getByTestId('create-post').tagName).toBe('BUTTON'))
    fireEvent.click(screen.getByTestId('create-event'))
    expect(screen.getByRole('link', { name: 'Bakery' })).toHaveAttribute('href', '/g/def?compose=event#announce')
  })

  it('Escape closes the sheet and focus returns to the ➕', () => {
    render(<CreateDock />)
    screen.getByTestId('create-fab').focus()
    openSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is absent on sign-in and the edit screen', () => {
    pathname.current = '/g/abc/edit'
    const { container } = render(<CreateDock />)
    expect(container).toBeEmptyDOMElement()
  })
})
