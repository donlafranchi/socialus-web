import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { CreateMenu } from './CreateMenu'
import { ExploreSearchProvider, useLendExploreSearch } from '@/components/shell/explore-search'

const MEMBER = { id: 'm0', email: 'a@b.c' }
const auth = { user: MEMBER as { id: string; email: string } | null, loading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const own = vi.fn()
vi.mock('@/lib/member/own-pages', () => ({ getOwnPages: (...a: unknown[]) => own(...a) }))
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const page = (name: string, href: string, lifecycleState = 'active') => ({ name, href, lifecycleState })

beforeEach(() => own.mockResolvedValue([]))
afterEach(() => {
  cleanup()
  auth.user = MEMBER
  own.mockReset()
  push.mockReset()
})

const openMenu = () => fireEvent.click(screen.getByTestId('create-menu'))

describe('CreateMenu — the one ➕ (Don, 2026-11-01)', () => {
  it('is an icon-only 44px button labelled Create', () => {
    render(<CreateMenu />)
    const btn = screen.getByRole('button', { name: 'Create' })
    expect(btn.textContent?.trim()).toBe('')
    expect(btn.className).toContain('size-11')
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('signed out, there is no ➕', () => {
    auth.user = null
    render(<CreateMenu />)
    expect(screen.queryByTestId('create-menu')).not.toBeInTheDocument()
  })

  it('offers Start a Page and Propose something, nothing else', () => {
    render(<CreateMenu />)
    openMenu()
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Start a Page', 'Propose something'])
    expect(items[0]).toHaveAttribute('href', '/create')
  })

  it('with no Page, Propose something starts one', async () => {
    render(<CreateMenu />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Propose something' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/create'))
  })

  it('with one Page, Propose something opens its composer', async () => {
    own.mockResolvedValue([page('Bakery', '/g/b')])
    render(<CreateMenu />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Propose something' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/g/b?compose=proposal#announce'))
  })

  it('with several Pages, it asks which Page', async () => {
    own.mockResolvedValue([page('Bakery', '/g/b'), page('Choir', '/g/c'), page('Gone', '/g/x', 'archived')])
    render(<CreateMenu />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Propose something' }))
    const sheet = await screen.findByRole('dialog', { name: 'Which Page?' })
    expect(within(sheet).getByRole('link', { name: 'Choir' })).toHaveAttribute('href', '/g/c?compose=proposal#announce')
    expect(within(sheet).queryByText('Gone')).not.toBeInTheDocument()
  })

  it('on Explore, it holds the List/Map switch', () => {
    const view = vi.fn()
    function Lend() {
      useLendExploreSearch({ query: '', onQueryChange: () => {}, knownTags: TAGS, areaLabel: null, onOpenScope: () => {}, filtersActive: false, onOpenFilters: () => {}, focusRequest: 0, view: 'list', onViewChange: view })
      return null
    }
    render(
      <ExploreSearchProvider>
        <CreateMenu />
        <Lend />
      </ExploreSearchProvider>,
    )
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show the map' }))
    expect(view).toHaveBeenCalledWith('map')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Escape closes it', () => {
    render(<CreateMenu />)
    openMenu()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

const TAGS: string[] = []
