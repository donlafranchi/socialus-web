import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ItemFeedCard } from './ItemFeedCard'
import { FeedEmptyState } from './FeedEmptyState'
import { MakeThisYoursBanner } from './MakeThisYoursBanner'
import type { FeedItem } from '@/lib/feed/locality-feed'

afterEach(() => cleanup())

const baseItem: FeedItem = {
  itemId: 'abcdef1234567890',
  kind: 'gathering',
  title: 'Pottery Night',
  category: 'crafts',
  brandLabel: null,
  groupId: null,
  ownerHandle: 'maya',
  nearestLocationLabel: 'Drake’s',
  responseCount: 2,
  primaryTag: 'crafts',
  publishedAt: '2026-06-01T00:00:00Z',
  photoUrl: null,
}

describe('T088 — ItemFeedCard', () => {
  it('renders title, kind label, and location', () => {
    render(<ItemFeedCard item={baseItem} />)
    expect(screen.getByText('Pottery Night')).toBeTruthy()
    expect(screen.getByTestId('feed-item-kind').textContent).toBe('Event')
    expect(screen.getByText('Drake’s')).toBeTruthy()
  })

  // #253 — a card names no seller. The item carries no member name to show.
  it('names no seller when there is no brand label', () => {
    render(<ItemFeedCard item={baseItem} />)
    expect(Object.keys(baseItem)).not.toContain('ownerDisplayName')
    expect(screen.queryByTestId('feed-item-owner')).toBeNull()
  })

  it('links to the member-scoped Item URL with kind segment + id8 fragment', () => {
    render(<ItemFeedCard item={baseItem} />)
    const link = screen.getByTestId('feed-item-card') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/m/maya/e/pottery-night-abcdef12')
  })

  it('prefers the brand label over the owner name when present', () => {
    render(<ItemFeedCard item={{ ...baseItem, brandLabel: 'Oak Park Pottery' }} />)
    expect(screen.getByTestId('feed-item-owner').textContent).toBe('Oak Park Pottery')
  })

  it('renders a hero image when photoUrl is present', () => {
    render(<ItemFeedCard item={{ ...baseItem, photoUrl: 'https://cdn.test/a.jpg' }} />)
    const img = screen.getByTestId('feed-item-photo') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://cdn.test/a.jpg')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('loading')).toBe('lazy')
  })
})

// T118 — the media block is unconditional (Decision A, 2026-09-04).
// design-language.md § Card media block.
describe('T118 — ItemFeedCard media block', () => {
  it('renders the media block when there is no photo', () => {
    render(<ItemFeedCard item={baseItem} />)
    expect(screen.getByTestId('feed-item-media')).toBeTruthy()
  })

  it('renders the media block when there is a photo', () => {
    render(<ItemFeedCard item={{ ...baseItem, photoUrl: 'https://cdn.test/a.jpg' }} />)
    expect(screen.getByTestId('feed-item-media')).toBeTruthy()
  })

  it('falls back to the kind field, not a photo, when photoUrl is null', () => {
    render(<ItemFeedCard item={baseItem} />)
    expect(screen.queryByTestId('feed-item-photo')).toBeNull()
    expect(screen.getByTestId('feed-item-placeholder')).toBeTruthy()
  })

  it('treats a blank photoUrl as no photo', () => {
    render(<ItemFeedCard item={{ ...baseItem, photoUrl: '   ' }} />)
    expect(screen.queryByTestId('feed-item-photo')).toBeNull()
    expect(screen.getByTestId('feed-item-placeholder')).toBeTruthy()
  })

  it('shows the photo instead of the kind field when one exists', () => {
    render(<ItemFeedCard item={{ ...baseItem, photoUrl: 'https://cdn.test/a.jpg' }} />)
    expect(screen.queryByTestId('feed-item-placeholder')).toBeNull()
  })

  it('carries a distinct glyph for each of the seven kinds', () => {
    const kinds = ['gathering', 'product', 'service', 'wonder', 'offer', 'ask', 'initiative']
    const seen = new Set<string>()
    for (const kind of kinds) {
      cleanup()
      render(<ItemFeedCard item={{ ...baseItem, kind }} />)
      const glyph = screen.getByTestId('feed-item-placeholder').getAttribute('data-glyph')
      expect(glyph).toBeTruthy()
      seen.add(glyph as string)
    }
    expect(seen.size).toBe(kinds.length)
  })

  it('still renders a glyph for an unknown kind', () => {
    render(<ItemFeedCard item={{ ...baseItem, kind: 'sasquatch' }} />)
    expect(screen.getByTestId('feed-item-placeholder').getAttribute('data-glyph')).toBeTruthy()
  })

  it('renders the kind as an editorial label, not a chip', () => {
    render(<ItemFeedCard item={baseItem} />)
    const kind = screen.getByTestId('feed-item-kind')
    expect(kind.textContent).toBe('Event')
    expect(kind.className).not.toContain('chip')
  })

  it('shows the kind label on photo cards too', () => {
    render(<ItemFeedCard item={{ ...baseItem, photoUrl: 'https://cdn.test/a.jpg' }} />)
    expect(screen.getByTestId('feed-item-kind').textContent).toBe('Event')
  })

  it('fills its grid cell and declares no width of its own', () => {
    render(<ItemFeedCard item={baseItem} />)
    const card = screen.getByTestId('feed-item-card')
    expect(card.className).toContain('h-full')
    expect(card.className).not.toMatch(/(^|\s)w-\d/)
    expect(card.className).not.toMatch(/(^|\s)(sm:|md:|lg:)?grid-cols-/)
  })

  it('carries a hairline border at rest', () => {
    render(<ItemFeedCard item={baseItem} />)
    expect(screen.getByTestId('feed-item-card').className).toContain('border')
  })

  it('uses the product segment for a product', () => {
    render(<ItemFeedCard item={{ ...baseItem, kind: 'product', title: 'Sourdough' }} />)
    const link = screen.getByTestId('feed-item-card') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/m/maya/p/sourdough-abcdef12')
  })
})

describe('T088 — FeedEmptyState', () => {
  it('widens to the parent Place when one exists', () => {
    render(<FeedEmptyState parent={{ displayName: 'Sacramento', slug: 'sacramento' }} />)
    const widen = screen.getByTestId('widen-locality') as HTMLAnchorElement
    expect(widen.textContent).toContain('Sacramento')
    expect(widen.getAttribute('href')).toBe('/?place=sacramento')
  })

  it('falls back to state copy at the root', () => {
    render(<FeedEmptyState parent={null} />)
    expect(screen.getByTestId('widen-locality').textContent).toContain('state')
  })
})

describe('T088 — MakeThisYoursBanner', () => {
  it('shows the signup CTA when anonymous', () => {
    render(<MakeThisYoursBanner isAuthenticated={false} />)
    const cta = screen.getByTestId('signup-cta')
    const link = cta.querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/auth/login?next=/onboarding')
  })

  it('hides when authenticated', () => {
    const { container } = render(<MakeThisYoursBanner isAuthenticated={true} />)
    expect(container.querySelector('[data-testid="signup-cta"]')).toBeNull()
  })
})
