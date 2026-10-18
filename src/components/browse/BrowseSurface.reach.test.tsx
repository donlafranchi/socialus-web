// #922 — Explore says how far it reaches in a quiet line at the top, and "Show more nearby" widens one ring.
// Never a chip (Don, 2026-10-18).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/lib/browse/snapshot'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}))

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

describe('#922 — the reach line', () => {
  it('says how far, with a plain "Show more nearby" link, and no chip or pill', () => {
    render(<BrowseSurface initial={snapshot()} />)
    const line = screen.getByTestId('explore-reach')
    expect(line).toHaveTextContent('Within 15 minutes of you · Show more nearby')
    expect(line.outerHTML).not.toMatch(/rounded-full|border/)
  })

  it('"Show more nearby" asks for the next ring and keeps it in the link', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ reach: { minutes: 30, from: null } }))
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show more nearby' }))
    await waitFor(() => expect(screen.getByTestId('explore-reach')).toHaveTextContent('Within 30 minutes of you'))
    expect(browseFeedAction).toHaveBeenCalledWith(null, null, null, null, 30)
    expect(window.location.pathname + window.location.search).toBe('/explore?reach=30')
  })

  it('past the hour it offers the whole area, and there it stops offering', () => {
    render(<BrowseSurface initial={snapshot({ reach: { minutes: 60, from: null } })} />)
    expect(screen.getByRole('button', { name: 'Show more nearby' })).toBeInTheDocument()
    cleanup()
    render(<BrowseSurface initial={snapshot({ reach: { minutes: 'all', from: null } })} />)
    expect(screen.getByTestId('explore-reach')).toHaveTextContent('Across the whole area')
    expect(screen.queryByRole('button', { name: 'Show more nearby' })).toBeNull()
  })

  it('signed out it names the town the rings start from, never "you"', () => {
    render(<BrowseSurface initial={snapshot({ signedIn: false, reach: { minutes: 30, from: 'Sacramento' } })} />)
    expect(screen.getByTestId('explore-reach')).toHaveTextContent('Within 30 minutes of Sacramento')
  })

  it('is absent while a search narrows the list, and when a neighbourhood is picked', () => {
    search = 'q=bread'
    render(<BrowseSurface initial={snapshot()} />)
    expect(screen.queryByTestId('explore-reach')).toBeNull()
    cleanup()
    search = ''
    render(<BrowseSurface initial={snapshot({ reach: null, area: { id: 'p1', name: 'Midtown' } })} />)
    expect(screen.queryByTestId('explore-reach')).toBeNull()
  })

  it('the filter sheet sets the reach exactly', async () => {
    browseFeedAction.mockResolvedValue(snapshot({ reach: { minutes: 45, from: null } }))
    render(<BrowseSurface initial={snapshot()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /filter/i })[0]!)
    fireEvent.click(await screen.findByLabelText('45 minutes'))
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(browseFeedAction).toHaveBeenCalledWith(null, null, null, null, 45))
  })
})
