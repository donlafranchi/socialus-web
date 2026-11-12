// F121 — Explore's shelves, loaded on the server for the signed-in reader and drawn as rows with See all.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const loadShelves = vi.fn()
vi.mock('@/lib/shelves/load', () => ({ loadShelves: (...a: unknown[]) => loadShelves(...a) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }) }))
vi.mock('@/app/_actions/shelf-actions', () => ({ logShelfAction: async () => {} }))
import { ExploreShelves } from './ExploreShelves'

afterEach(cleanup)
const post = (id: string) => ({ resultKind: 'post', resultId: id, groupId: 'g', name: 'Page', href: `/p/${id}`, tags: [], body: id, headline: id })

describe('F121 — ExploreShelves', () => {
  it('draws each loaded shelf as a row, in order, counted against its shelf row', async () => {
    loadShelves.mockResolvedValue([
      { id: 'next-7-days', logId: 'next-7-days', title: 'Next 7 days', items: [post('a')] },
      { id: 'because-you-like:gardening', logId: 'because-you-like', title: 'Because you like gardening', items: [post('b')] },
    ])
    render(await ExploreShelves({ scope: { metroId: 'm' } }))
    expect(screen.getAllByTestId('shelf-row').map((s) => s.getAttribute('aria-label'))).toEqual(['Next 7 days', 'Because you like gardening'])
    expect(document.querySelector('[data-shelf="because-you-like"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See all Next 7 days' })).toBeInTheDocument()
    expect(loadShelves.mock.calls[0]![1]).toMatchObject({ scope: { metroId: 'm' }, memberId: 'me' })
  })

  // [guards F121.5]
  it('no shelves, no section', async () => {
    loadShelves.mockResolvedValue([])
    expect(await ExploreShelves({ scope: { metroId: 'm' } })).toBeNull()
  })
})
