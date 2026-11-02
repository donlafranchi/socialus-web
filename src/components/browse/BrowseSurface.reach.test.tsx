// #922 — how far Explore reaches is set in the filter sheet. The quiet line at the top went (Don, 2026-11-01).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { renderExplore, openFilters } from './explore-harness'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/lib/browse/snapshot'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/explore',
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

const browseFeedAction = vi.fn()
vi.mock('@/app/explore/actions', () => ({
  browseMapAction: async () => [],
  browseFeedAction: (...args: unknown[]) => browseFeedAction(...args),
  markLeadSeenAction: async () => {},
  searchAreasAction: async () => [],
}))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }

function snapshot(over: Partial<BrowseSnapshot> = {}): BrowseSnapshot {
  return {
    results: [],
    following: [],
    happening: { today: [], thisWeek: [], thisWeekend: [] },
    map: [],
    area: null,
    metro: SAC,
    chosen: false,
    metros: [SAC],
    signedIn: true,
    failed: false,
    reach: { minutes: 15, from: null },
    ...over,
  }
}

beforeEach(() => {
  search = ''
  window.history.replaceState(null, '', '/')
  replace.mockClear()
  browseFeedAction.mockReset()
})
afterEach(cleanup)

describe('#922 — Explore’s reach', () => {
  it('the filter sheet sets the reach exactly', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ reach: { minutes: 45, from: null } }))
    renderExplore(<BrowseSurface initial={snapshot()} />)
    openFilters()
    fireEvent.click(await screen.findByLabelText('45 minutes'))
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith(null, null, null, null, 45))
  })
})
