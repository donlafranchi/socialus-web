import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CreateHeaderButton } from './CreateHeaderButton'

const MEMBER = { id: 'm0', email: 'a@b.c' }
const auth = { user: MEMBER as { id: string; email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const own = vi.fn()
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages: (...a: unknown[]) => own(...a) }))
const pathname = { current: '/explore' }
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

const page = (name: string, href: string, lifecycleState = 'active') => ({ name, href, lifecycleState })

beforeEach(() => own.mockResolvedValue([]))

afterEach(() => {
  cleanup()
  auth.user = MEMBER
  auth.loading = false
  pathname.current = '/explore'
  own.mockReset()
})

const openSheet = () => fireEvent.click(screen.getByTestId('create-fab'))

describe('CreateHeaderButton (#1094, #1141)', () => {
  it('is one labelled 56px round button, with room beside it', () => {
    render(<CreateHeaderButton />)
    const fab = screen.getByRole('button', { name: 'Create' })
    expect(fab.className).toContain('size-[var(--dock-size)]')
    expect(fab.className).toContain('rounded-full')
    const dock = screen.getByTestId('create-dock')
    expect(dock.className).toContain('justify-end')
    expect(dock.className).toContain('--float-offset')
  })

  it('opens a dialog offering Post, Event, Page and Wonder', () => {
    render(<CreateHeaderButton />)
    openSheet()
    const dialog = screen.getByRole('dialog', { name: 'Create' })
    for (const n of ['Event', 'Sale', 'News', 'Wonder', 'Hiring', 'Page']) expect(within(dialog).getByText(n)).toBeInTheDocument()
  })

  it('with no Page yet, News leads to creating one first and says why', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([])
    render(<CreateHeaderButton />)
    openSheet()
    await waitFor(() => expect(screen.getByText(/Start one first/)).toBeInTheDocument())
    expect(screen.getByTestId('create-news')).toHaveAttribute('href', '/create')
  })

  it('with one Page, News opens its composer and a draft is not offered', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([page('Sac', '/g/abc'), page('Draft', '/g/zzz', 'draft')])
    render(<CreateHeaderButton />)
    openSheet()
    await waitFor(() => expect(screen.getByTestId('create-news')).toHaveAttribute('href', '/g/abc#announce'))
    expect(screen.getByTestId('create-wonder')).toHaveAttribute('href', '/g/abc?compose=wonder#announce')
  })

  it('with several Pages, a kind asks which Page', async () => {
    auth.user = { id: 'm1', email: 'a@b.c' }
    own.mockResolvedValue([page('Sac', '/g/abc'), page('Bakery', '/g/def')])
    render(<CreateHeaderButton />)
    openSheet()
    await waitFor(() => expect(screen.getByTestId('create-news').tagName).toBe('BUTTON'))
    fireEvent.click(screen.getByTestId('create-event'))
    expect(screen.getByRole('link', { name: 'Bakery' })).toHaveAttribute('href', '/g/def?compose=event#announce')
  })

  it('Escape closes the sheet and focus returns to the ➕', () => {
    render(<CreateHeaderButton />)
    screen.getByTestId('create-fab').focus()
    openSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('signed out there is no ➕, floating or in the header (#1141)', () => {
    auth.user = null
    const { container } = render(<CreateHeaderButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for auth instead of flashing a ➕ at someone signed out', () => {
    auth.loading = true
    const { container } = render(<CreateHeaderButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is for phones: the floating one hides from 744px up, where the header button takes over (#1141)', () => {
    render(<CreateHeaderButton />)
    expect(screen.getByTestId('create-dock').className).toContain('md:hidden')
    const header = screen.getByTestId('create-header')
    expect(header.className).toContain('hidden')
    expect(header.className).toContain('md:inline-flex')
    expect(header).toHaveAccessibleName('Create')
  })

  it('the header button opens the same sheet', () => {
    render(<CreateHeaderButton />)
    fireEvent.click(screen.getByTestId('create-header'))
    expect(screen.getByRole('dialog', { name: 'Create' })).toBeInTheDocument()
  })

  it('is absent on sign-in and the edit screen', () => {
    pathname.current = '/g/abc/edit'
    const { container } = render(<CreateHeaderButton />)
    expect(container).toBeEmptyDOMElement()
  })
})
