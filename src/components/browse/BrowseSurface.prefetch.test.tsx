// #555 — the top three cards read their Page ahead of the tap; the rest keep the router's default.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseSurface } from './BrowseSurface'
import type { BrowseSnapshot } from '@/app/explore/load'
import type { BrowseResult } from '@/lib/feed/browse-feed'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/explore/actions', () => ({ browseMapAction: vi.fn(), browseFeedAction: vi.fn(), searchAreasAction: async () => [] }))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'default' : String(prefetch)} {...rest}>{children}</a>
  ),
}))

const SAC = { id: 'm1', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true }
const result = (i: number): BrowseResult => ({
  resultKind: 'page', resultId: `r${i}`, groupId: `g${i}`, groupKind: 'business', slug: `page-${i}`, name: `Page ${i}`, href: `/g/p${i}`,
  photoUrl: null, description: 'd', body: null, tags: [], startsAt: null, locationId: 'l', locationLabel: 'Midtown', longitude: -121.4, latitude: 38.5,
  pageCreatedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', postedAt: null, sortAt: '2026-09-02T00:00:00Z', withheld: false,
  announcementCount: null, announcementIds: null,
})
const snapshot = (n: number): BrowseSnapshot => ({
  results: Array.from({ length: n }, (_, i) => result(i)), following: [], happening: { today: [], thisWeek: [], thisWeekend: [] }, map: [],
  area: null, metro: SAC, chosen: false, metros: [SAC], signedIn: false, failed: false,
})

afterEach(cleanup)

describe('Explore cards prefetch their Page (#555)', () => {
  it('the first three read ahead; the rest use the default', () => {
    render(<BrowseSurface initial={snapshot(6)} />)
    const links = [0, 1, 2, 3, 4, 5].map((i) => screen.getByText(`Page ${i}`).closest('a')!)
    expect(links.map((a) => a.getAttribute('data-prefetch'))).toEqual(['true', 'true', 'true', 'default', 'default', 'default'])
  })
})
