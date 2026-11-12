import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseShelves } from './BrowseShelves'
import type { BrowseResult } from '@/lib/feed/browse-feed'

afterEach(cleanup)
beforeEach(() => window.history.replaceState(null, '', '/explore?q=music'))

const r = (id: string): BrowseResult =>
  ({ resultKind: 'page', resultId: id, groupId: id, groupKind: 'business', slug: id, name: `Page ${id}`, href: `/p/${id}`, tags: [] }) as unknown as BrowseResult

const groups = [
  { key: 'pages', label: 'Places & groups', results: [r('a'), r('b')] },
  { key: 'concerts', label: 'Concerts', results: [r('c')] },
]

describe('BrowseShelves', () => {
  it('draws one row per group, in order', () => {
    render(<BrowseShelves groups={groups} />)
    expect(screen.getAllByTestId('shelf-row').map((s) => s.getAttribute('aria-label'))).toEqual(['Places & groups', 'Concerts'])
  })

  it('See all opens the full list with its own address, and Back returns to the rows', () => {
    render(<BrowseShelves groups={groups} />)
    fireEvent.click(screen.getByRole('button', { name: 'See all Places & groups' }))
    expect(screen.getByTestId('shelf-screen')).toBeInTheDocument()
    expect(new URL(window.location.href).searchParams.get('shelf')).toBe('pages')
    expect(new URL(window.location.href).searchParams.get('q')).toBe('music')
    act(() => {
      window.history.replaceState(null, '', '/explore?q=music')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.queryByTestId('shelf-screen')).toBeNull()
  })

  it('sizes a row of posts as posts and a row of Pages as Pages', () => {
    const p = (id: string) => ({ ...r(id), resultKind: 'post' }) as BrowseResult
    render(<BrowseShelves groups={[groups[0]!, { key: 'concerts', label: 'Concerts', results: [p('c')] }]} />)
    const [pages, posts] = screen.getAllByTestId('shelf-row').map((s) => within(s).getAllByRole('listitem')[0]!.className)
    expect(pages).toMatch(/w-4\/5/)
    expect(posts).toMatch(/\/1\.5\)\]/)
  })

  it('a shared link opens straight on that list', () => {
    window.history.replaceState(null, '', '/explore?q=music&shelf=concerts')
    render(<BrowseShelves groups={groups} />)
    expect(within(screen.getByTestId('shelf-screen')).getByRole('heading', { name: 'Concerts' })).toBeInTheDocument()
  })
})
