// #922 (Don, 2026-10-18) — a Page card leads with its photo, a post card with its words; quick links on Page
// cards only; no chips or pills anywhere [always].

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { BrowseResultCard, splitPost } from './BrowseResultCard'
import type { BrowseResult } from '@/lib/feed/browse-feed'

afterEach(cleanup)

const base = {
  resultId: 'g-1', groupId: 'g-1', groupKind: 'business', slug: 's', name: 'Corner Bakery', href: '/g/abc123',
  photoUrl: 'https://example.test/p.jpg', description: 'Sourdough and pastries, baked daily.', body: null,
  tags: ['Food & drink', 'Local business', 'Farmers markets'], startsAt: null, locationId: 'l1', locationLabel: 'Midtown',
  latitude: 38.57, longitude: -121.47, pageCreatedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z',
  postedAt: null, sortAt: '2026-10-16T00:00:00Z', withheld: false, announcementCount: null, announcementIds: null,
} as const

const page = (over: Partial<BrowseResult> = {}): BrowseResult =>
  ({ ...base, resultKind: 'page', quickLinks: { website: 'https://corner.bakery', instagram: 'https://instagram.com/cb', fixedPoint: true }, ...over }) as BrowseResult

const post = (over: Partial<BrowseResult> = {}): BrowseResult =>
  ({
    ...base, resultKind: 'post', resultId: 'p-1', href: '/g/abc123#announcement-p-1', description: null,
    body: 'Pumpkin bread is back\nFresh from the oven every Saturday morning while it lasts. Come early.',
    startsAt: '2026-10-25T17:00:00Z', photoSource: 'post', pageAvatarUrl: 'https://example.test/avatar.jpg', ...over,
  }) as BrowseResult

describe('the Page card: image-led', () => {
  it('a large photo, then the name, one line, and up to two labels as small-caps text', () => {
    render(<BrowseResultCard result={page()} />)
    expect(screen.getByTestId('tile-image').className).toMatch(/aspect-\[4\/3\]/)
    expect(screen.getByTestId('tile-title')).toHaveTextContent('Corner Bakery')
    expect(screen.getByTestId('tile-tagline').className).toMatch(/line-clamp-1/)
    const labels = screen.getByTestId('card-labels')
    expect(labels).toHaveTextContent('Food & drink · Local business')
    expect(labels).not.toHaveTextContent('Farmers markets')
    expect(labels.className).toMatch(/uppercase/)
  })

  it('carries no chip or pill anywhere', () => {
    const { container } = render(<BrowseResultCard result={page({ sampleKind: 'event' })} />)
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(0)
    expect(screen.getByTestId('sample-label')).toHaveTextContent('Sample')
    expect(screen.getByTestId('card-type')).toHaveAttribute('data-type', 'page')
  })
})

describe('quick links: Page cards only', () => {
  it('icons with screen-reader labels, 44px targets, opening in a new tab safely', () => {
    render(<BrowseResultCard result={page()} />)
    const row = screen.getByTestId('quick-links')
    const links = within(row).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Directions to Corner Bakery', 'Corner Bakery website', 'Corner Bakery on Instagram'])
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a.className).toMatch(/size-tap/)
    }
    expect(screen.getByTestId('quick-link-directions').getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=38.57%2C-121.47')
  })

  it('no Directions without a fixed point (an area, or a Page that moves)', () => {
    render(<BrowseResultCard result={page({ quickLinks: { website: 'https://corner.bakery', fixedPoint: false } })} />)
    expect(screen.queryByTestId('quick-link-directions')).toBeNull()
    expect(screen.getByTestId('quick-link-website')).toBeInTheDocument()
  })

  it('none signed out, and none on a post', () => {
    render(<BrowseResultCard result={page({ quickLinks: null })} />)
    expect(screen.queryByTestId('quick-links')).toBeNull()
    cleanup()
    render(<BrowseResultCard result={post({ quickLinks: { website: 'https://x.test', fixedPoint: true } })} />)
    expect(screen.queryByTestId('quick-links')).toBeNull()
  })
})

describe('the post card: text-led', () => {
  it('a strong date line, the title, two lines of body, a smaller photo, and the Page’s name and avatar', () => {
    render(<BrowseResultCard result={post()} />)
    const when = screen.getByTestId('browse-post-when')
    expect(when).toHaveTextContent(/Sun Oct 25 · 10am/)
    expect(when.className).toMatch(/uppercase/)
    expect(screen.getByTestId('tile-title')).toHaveTextContent('Pumpkin bread is back')
    expect(screen.getByTestId('tile-tagline')).toHaveTextContent(/^Fresh from the oven/)
    expect(screen.getByTestId('tile-tagline').className).toMatch(/line-clamp-2/)
    expect(screen.getByTestId('tile-image').className).toMatch(/size-20/)
    expect(screen.getByTestId('post-page-name')).toHaveTextContent('Corner Bakery')
    expect(screen.getByTestId('card-type')).toHaveAttribute('data-type', 'post')
  })

  it('a post with no photo of its own keeps F099’s one image (the Page picture) and uses it as the avatar too', () => {
    render(<BrowseResultCard result={post({ photoSource: 'page', pageAvatarUrl: null })} />)
    expect(screen.getByTestId('tile-image').querySelector('img')).toHaveAttribute('alt', 'Corner Bakery')
  })

  it('splits a post into a title and the rest', () => {
    expect(splitPost('One line')).toEqual({ title: 'One line', rest: '' })
    expect(splitPost(' Title \n body\nmore ')).toEqual({ title: 'Title', rest: 'body\nmore' })
    expect(splitPost(null)).toEqual({ title: '', rest: '' })
  })
})
