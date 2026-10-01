// bug #211 — the card and the Page have to agree about the announcement.
//
// Don tapped a card reading "THU, SEP 24, 2:12 AM", landed on the Page, and
// found "Wednesday, September 23 at 7:12pm". Same instant, two surfaces, two
// different days — which reads as the information not being there.
//
// The card formatted in the READER'S DEVICE timezone; the Page formats in the
// metro's. Both were deliberate and nobody reconciled them.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseResultCard } from './BrowseResultCard'
import { formatMetroDateTime, formatCardWhen } from '@/lib/metro/metro-time'
import type { BrowseResult } from '@/lib/feed/browse-feed'

/** 2026-09-24 02:12 UTC is 2026-09-23 19:12 in the metro — a different DAY. */
const INSTANT = '2026-09-24T02:12:00+00:00'

const post = (over: Partial<BrowseResult> = {}): BrowseResult =>
  ({
    resultKind: 'post',
    resultId: 'p-1',
    groupId: 'g-1',
    groupKind: 'place',
    slug: 'sacriver-floaters',
    name: 'SacRiver Floaters',
    href: '/g/sacriver-floaters-abc123#announcement-p-1',
    photoUrl: null,
    description: null,
    body: 'We’re meeting tomorrow',
    tags: [],
    startsAt: INSTANT,
    locationId: null,
    locationLabel: null,
    lat: null,
    lng: null,
    pageCreatedAt: '2026-09-01T00:00:00Z',
    updatedAt: INSTANT,
    postedAt: '2026-09-20T18:00:00Z',
    sortAt: INSTANT,
    ...over,
  }) as BrowseResult

afterEach(cleanup)

describe('the card renders metro time, the same as the Page', () => {
  it('shows the metro’s day, not the reader’s device’s', () => {
    render(<BrowseResultCard result={post()} />)
    // Exactly what PagePosts renders for the same instant.
    const onThePage = formatMetroDateTime(INSTANT)
    expect(onThePage).toMatch(/September 23/)
    // The card says the same day. It said "Thu, Sep 24" before this fix.
    expect(screen.getByText(/September 23|Sep 23/i)).toBeInTheDocument()
    expect(screen.queryByText(/Sep 24|September 24/i)).not.toBeInTheDocument()
  })

  // #256: the start leads the card, large, in the metro's words.
  it('leads with when it happens, in large type', () => {
    render(<BrowseResultCard result={post()} />)
    const when = screen.getByTestId('browse-post-when')
    expect(when).toHaveTextContent(formatCardWhen(INSTANT))
    expect(when.className).toMatch(/text-(lg|xl|2xl)/)
  })

  // #256 (Don, 2026-09-30): an announcement with no time keeps its posted date.
  it('says when an undated announcement was posted', () => {
    render(<BrowseResultCard result={post({ startsAt: null, postedAt: '2026-09-02T18:00:00Z' })} />)
    expect(screen.getByTestId('browse-post-when')).toHaveTextContent('Posted Sep 2')
  })
})

describe('the card links to the announcement, not just its Page', () => {
  it('keeps the fragment the feed put on it', () => {
    render(<BrowseResultCard result={post()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/g/sacriver-floaters-abc123#announcement-p-1')
  })
})

// F093 — a withheld announcement is a different card, chosen here.
//
// The choice lives in BrowseResultCard rather than in BrowseSurface so that
// every surface rendering browse results gets it without being told: the grid,
// the map's list, and whatever renders results next.
describe('F093 — the signed-out form', () => {
  const withheld = (over: Partial<BrowseResult> = {}): BrowseResult =>
    post({ withheld: true, body: null, startsAt: null, announcementCount: 3, ...over })

  it('renders the withheld card when the result is withheld', () => {
    render(<BrowseResultCard result={withheld()} />)
    expect(screen.getByTestId('withheld-cta')).toBeInTheDocument()
  })

  it('renders no date line, because there is no time to show', () => {
    render(<BrowseResultCard result={withheld()} />)
    expect(screen.queryByTestId('browse-post-when')).not.toBeInTheDocument()
  })

  it('leaves a readable announcement on the ordinary card', () => {
    // Criterion 6 — a signed-in member sees no change.
    render(<BrowseResultCard result={post()} />)
    expect(screen.queryByTestId('withheld-cta')).not.toBeInTheDocument()
    expect(screen.getByTestId('browse-post-when')).toBeInTheDocument()
  })
})
