// #1183 — a search answers with posts from members too: one "From neighbors" group, signed in only.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import { renderExplore, searchBox } from './explore-harness'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { MemberPost } from '@/lib/member-posts/read'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(''),
  unstable_isUnrecognizedActionError: () => false,
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))
const browseFeedAction = vi.fn()
vi.mock('@/app/explore/actions', () => ({
  browseMapAction: async () => [],
  browseFeedAction: (...a: unknown[]) => browseFeedAction(...a),
  searchAreasAction: async () => [],
  markLeadSeenAction: async () => {},
}))
const searchMemberPostsAction = vi.fn()
vi.mock('@/app/_actions/member-post-actions', () => ({ searchMemberPostsAction: (...a: unknown[]) => searchMemberPostsAction(...a) }))

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }
const snapshot = (over: Partial<BrowseSnapshot> = {}): BrowseSnapshot =>
  ({ results: [], following: [], happening: { today: [], thisWeek: [], thisWeekend: [] }, map: [], area: null, metro: SAC, chosen: false, metros: [SAC], signedIn: true, failed: false, ...over }) as BrowseSnapshot
const cat: MemberPost = {
  id: 'p1', kind: 'lost_found', body: 'Grey cat, white paws.', placeName: 'Curtis Park', saleOn: null, street: null,
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), labels: [], labelsPinned: false,
  displayName: 'Rosa P', avatarUrl: null, mine: false, ended: false, answered: false, answers: null,
}

beforeEach(() => {
  browseFeedAction.mockReset().mockResolvedValue(snapshot())
  searchMemberPostsAction.mockReset().mockResolvedValue([cat])
})
afterEach(cleanup)

describe('#1183 — From neighbors in search', () => {
  it('a search shows matching posts from members as their own group', async () => {
    renderExplore(<BrowseSurface initial={snapshot()} />)
    fireEvent.change(searchBox(), { target: { value: 'cat' } })
    const group = await screen.findByTestId('member-posts-search')
    expect(group).toHaveAttribute('aria-label', 'From neighbors')
    expect(within(group).getByText('Grey cat, white paws.')).toBeInTheDocument()
    expect(searchMemberPostsAction).toHaveBeenCalledWith({ metroId: 'm1' }, 'cat')
  })

  it('signed out, never asked', async () => {
    renderExplore(<BrowseSurface initial={snapshot({ signedIn: false })} />)
    fireEvent.change(searchBox(), { target: { value: 'cat' } })
    await screen.findByTestId('browse-page')
    expect(searchMemberPostsAction).not.toHaveBeenCalled()
  })
})
