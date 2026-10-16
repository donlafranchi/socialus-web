// #796 (Don, 2026-10-16) — every card says what it is (a megaphone for a post, a page for a Page), and a
// seeder sample is marked as one wherever it shows: a "Sample" chip (the accessible label) and a faint
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
  it('a post carries a megaphone and says "Post" to a screen reader', () => {
    render(<BrowseResultCard result={result()} />)
    const mark = screen.getByTestId('card-type')
    expect(mark).toHaveAttribute('data-type', 'post')
    expect(mark).toHaveTextContent('Post')
  })
  it('a Page carries a page icon and says "Page"', () => {
    render(<BrowseResultCard result={result({ resultKind: 'page', resultId: 'g-1', body: null, startsAt: null })} />)
    const mark = screen.getByTestId('card-type')
    expect(mark).toHaveAttribute('data-type', 'page')
    expect(mark).toHaveTextContent('Page')
  })
  it('a sample post shows the Sample chip and an aria-hidden, non-interactive watermark', () => {
    render(<BrowseResultCard result={result({ sampleKind: 'event' })} />)
    expect(screen.getByTestId('sample-chip')).toHaveTextContent('Sample')
    const wm = screen.getByTestId('sample-watermark')
    expect(wm).toHaveAttribute('aria-hidden', 'true')
    expect(wm.className).toMatch(/pointer-events-none/)
  })
  it('a real post shows neither', () => {
    render(<BrowseResultCard result={result({ sampleKind: null, body: 'Bread is back.' })} />)
    expect(screen.queryByTestId('sample-chip')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sample-watermark')).not.toBeInTheDocument()
  })
})

const POST = { id: 'pp-1', body: 'Sample · Deal this week.', createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', startsAt: null, endsAt: null, locationLabel: null }

describe('the Page’s post card', () => {
  it('a sample shows the chip, the watermark and the not-a-real-offer line', () => {
    render(<PagePosts groupId="g1" posts={[{ ...POST, sampleKind: 'deal' }]} canPost={false} followerCount={0} onPost={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByTestId('sample-chip')).toBeInTheDocument()
    expect(screen.getByTestId('sample-watermark')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(/not a real offer/i)).toBeInTheDocument()
  })
  it('a real post shows none of them', () => {
    render(<PagePosts groupId="g1" posts={[{ ...POST, body: 'Bread is back.' }]} canPost={false} followerCount={0} onPost={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.queryByTestId('sample-chip')).not.toBeInTheDocument()
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
