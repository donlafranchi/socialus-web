// #796 (Don, 2026-10-16) — every card says what it is (a megaphone for a post, a page for a Page), and a
// seeder sample is marked as one wherever it shows: a "Sample" label (small-caps text, never a chip) and a faint
// diagonal SAMPLE watermark (decorative). And no partial ring on the post you tapped.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseResultCard } from '@/components/browse/BrowseResultCard'
import type { BrowseResult } from '@/lib/feed/browse-feed'

vi.mock('@/app/_actions/search-places', () => ({ searchPlacesAction: vi.fn() }))
import { PagePosts } from '@/components/group/PagePosts'

afterEach(cleanup)

const result = (over: Partial<BrowseResult> = {}): BrowseResult =>
  ({
    resultKind: 'post', resultId: 'p-1', groupId: 'g-1', groupKind: 'business', slug: 's', name: 'Corner Bakery',
    href: '/g/abc123#announcement-p-1', photoUrl: null, description: null, body: 'Sample · Tasting on Saturday.',
    tags: [], startsAt: '2026-10-17T17:00:00Z', locationId: null, locationLabel: null, lat: null, lng: null,
    pageCreatedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', postedAt: '2026-10-16T00:00:00Z',
    sortAt: '2026-10-17T17:00:00Z', sampleKind: null, ...over,
  }) as BrowseResult

describe('Explore cards', () => {
  // plan #230 (Don, 2026-10-31) — a post card says what it is in its lead line (its kind), not with a mark.
  it('a post says its kind first, in words', () => {
    render(<BrowseResultCard result={result()} />)
    expect(screen.queryByTestId('card-type')).not.toBeInTheDocument()
    expect(screen.getByTestId('browse-post-lead').textContent).toMatch(/^(Event|News)\b/)
  })
  it('a Page carries a page icon and says "Page"', () => {
    render(<BrowseResultCard result={result({ resultKind: 'page', resultId: 'g-1', body: null, startsAt: null })} />)
    const mark = screen.getByTestId('card-type')
    expect(mark).toHaveAttribute('data-type', 'page')
    expect(mark).toHaveTextContent('Page')
  })
  // plan #230 — on an Explore card a sample says Sample once, in the lead line; the Page keeps its marks.
  it('a sample post says Sample once, in its lead line, with no label or watermark', () => {
    render(<BrowseResultCard result={result({ sampleKind: 'event' })} />)
    expect(screen.getByTestId('browse-post-lead').textContent).toMatch(/^Sample event\b/)
    expect(screen.queryByTestId('sample-label')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sample-watermark')).not.toBeInTheDocument()
  })
  it('a sample Page card keeps the Sample label and an aria-hidden, non-interactive watermark', () => {
    render(<BrowseResultCard result={result({ resultKind: 'page', resultId: 'g-1', body: null, startsAt: null, sampleKind: 'event' })} />)
    expect(screen.getByTestId('sample-label')).toHaveTextContent('Sample')
    const wm = screen.getByTestId('sample-watermark')
    expect(wm).toHaveAttribute('aria-hidden', 'true')
    expect(wm.className).toMatch(/pointer-events-none/)
  })
  it('a real post shows neither', () => {
    render(<BrowseResultCard result={result({ sampleKind: null, body: 'Bread is back.' })} />)
    expect(screen.queryByTestId('sample-label')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sample-watermark')).not.toBeInTheDocument()
  })
})

const POST = { id: 'pp-1', body: 'Sample · Deal this week.', createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', startsAt: null, endsAt: null, locationLabel: null }

describe('the Page’s post card', () => {
  // #1127 (plan #230): Sample once, in the lead line; no label, no watermark. The disclaimer is the body's own.
  it('a sample says Sample in its lead line, with no label and no watermark', () => {
    render(<PagePosts groupId="g1" posts={[{ ...POST, sampleKind: 'deal' }]} canPost={false} followerCount={0} onPost={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByTestId('page-post-lead').textContent).toMatch(/^Sample offer\b/)
    expect(screen.queryByTestId('sample-label')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sample-watermark')).not.toBeInTheDocument()
  })
  it('a real post shows none of them', () => {
    render(<PagePosts groupId="g1" posts={[{ ...POST, body: 'Bread is back.' }]} canPost={false} followerCount={0} onPost={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.queryByTestId('sample-label')).not.toBeInTheDocument()
    expect(screen.queryByText(/not a real offer/i)).not.toBeInTheDocument()
  })
  it('the post you tapped is brought into view without a ring', async () => {
    window.history.replaceState(null, '', '#announcement-pp-1')
    render(<PagePosts groupId="g1" posts={[POST]} canPost={false} followerCount={0} onPost={vi.fn()} onEdit={vi.fn()} />)
    const card = document.getElementById('announcement-pp-1')!
    await waitFor(() => expect(card).toHaveAttribute('data-highlighted', 'true'))
    expect(card.className).not.toMatch(/\bring-/)
    window.history.replaceState(null, '', '#')
  })
})
