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

// plan #230 (Don, 2026-10-31) — "I need people to see exactly what's being offered." KIND · WHEN · WHERE in
// small caps, built from fields; the headline in one line; the Page's avatar and name; the smaller photo.
describe('the post card: what it is, first', () => {
  const NOW = new Date('2026-10-22T17:00:00Z') // Thu
  it('a small-caps lead line, a one-line headline, the Page’s avatar and name, and a smaller photo', () => {
    render(<BrowseResultCard result={post({ postKind: 'event', headline: 'Pumpkin bread is back' })} now={NOW} />)
    const lead = screen.getByTestId('browse-post-lead')
    expect(lead).toHaveTextContent('Event · Sun 10am · Midtown')
    expect(lead.className).toMatch(/uppercase/)
    expect(lead.className).toMatch(/font-bold/)
    const title = screen.getByTestId('tile-title')
    expect(title).toHaveTextContent(/^Pumpkin bread is back$/)
    expect(title.className).toMatch(/line-clamp-1/)
    expect(screen.queryByTestId('tile-tagline')).toBeNull()
    expect(screen.getByTestId('tile-image').className).toMatch(/size-20/)
    expect(screen.getByTestId('post-page-name')).toHaveTextContent('Corner Bakery')
    const order = ['browse-post-lead', 'tile-title', 'post-page-name'].map((id) => screen.getByTestId(id))
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('never builds the lead line from the body, and never puts the Page name in the headline', () => {
    render(<BrowseResultCard result={post({ postKind: 'news', headline: null, startsAt: null, postedAt: '2026-10-20T17:00:00Z', body: 'Corner Bakery: new rye loaves.\nDetails here.' })} now={NOW} />)
    expect(screen.getByTestId('browse-post-lead')).toHaveTextContent(/^News · Tue · Midtown$/)
    expect(screen.getByTestId('tile-title')).toHaveTextContent(/^New rye loaves\.$/)
  })

  for (const [kind, word] of [['event', 'Event'], ['sale', 'Sale'], ['limited', 'Limited'], ['reminder', 'Reminder'], ['news', 'News'], ['wonder', 'Count me in'], ['hiring', 'Hiring']] as const) {
    it(`leads a ${kind} post with ${word}`, () => {
      render(<BrowseResultCard result={post({ postKind: kind, headline: 'One line' })} now={NOW} />)
      expect(screen.getByTestId('browse-post-lead').textContent!.startsWith(word)).toBe(true)
    })
  }

  it('a sample says Sample once, in the lead line: no watermark, no label, no disclaimer', () => {
    render(
      <BrowseResultCard
        result={post({ postKind: 'sale', sampleKind: 'deal', headline: 'Two pastries for one', endsAt: '2026-10-25T23:00:00Z', body: 'Sample · Corner Bakery deal.\nThis is a sample post showing what Corner Bakery’s Page could look like.' })}
        now={NOW}
      />,
    )
    expect(screen.getByTestId('browse-post-lead')).toHaveTextContent(/^Sample sale · Through Sun · Midtown$/)
    expect(screen.queryByTestId('sample-watermark')).toBeNull()
    expect(screen.queryByTestId('sample-label')).toBeNull()
    expect(screen.queryByText(/This is a sample post/)).toBeNull()
    const card = screen.getByTestId('tile-card')
    expect(card.textContent!.match(/sample/gi)).toHaveLength(1)
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

describe('#1127 — the post card reads cleanly at a phone’s width and in a desktop grid tile', () => {
  const NOW = new Date('2026-10-22T17:00:00Z') // Thu

  it('keeps the lead line to one line: a long where is the part cut short first', () => {
    render(<BrowseResultCard result={post({ postKind: 'sale', sampleKind: 'deal', headline: 'Two for one', endsAt: '2026-10-25T23:00:00Z', locationLabel: 'East Sacramento near the river' })} now={NOW} />)
    const lead = screen.getByTestId('browse-post-lead')
    expect(lead.className).not.toMatch(/line-clamp-2/)
    expect(lead.className).toMatch(/whitespace-nowrap/)
    expect(lead.className).toMatch(/\bh-4\b/)
    expect(lead.className).toMatch(/overflow-hidden/)
    expect(within(lead).getByTestId('browse-post-lead-head')).toHaveTextContent(/^Sample sale · Through Sun$/)
    const where = within(lead).getByTestId('browse-post-lead-where')
    expect(where).toHaveTextContent(/^· East Sacramento near the river$/)
    expect(where.className).toMatch(/truncate/)
    expect(within(lead).getByTestId('browse-post-lead-head').className).toMatch(/shrink-0/)
    expect(where.className).toMatch(/basis-\[4\.5rem\]/)
  })

  it('stacks the photo above the words in a narrow grid tile, and sits it beside them in a wide one', () => {
    render(<BrowseResultCard result={post({ postKind: 'event', headline: 'Pumpkin bread is back' })} now={NOW} />)
    const body = screen.getByTestId('browse-post-body')
    expect(screen.getByTestId('tile-card').className).toMatch(/@container/)
    expect(body.className).toMatch(/flex-col-reverse/)
    expect(body.className).toMatch(/@\[18rem\]:flex-row/)
    const img = screen.getByTestId('tile-image')
    expect(img.className).toMatch(/aspect-\[2\/1\]/)
    expect(img.className).toMatch(/@\[18rem\]:size-20/)
  })

  it('switches below a phone’s Happening shelf card (304px) and above a desktop grid tile (~236px)', () => {
    render(<BrowseResultCard result={post({ postKind: 'event', headline: 'Pumpkin bread is back' })} now={NOW} />)
    const rem = Number(/@\[(\d+(?:\.\d+)?)rem\]:flex-row/.exec(screen.getByTestId('browse-post-body').className)![1])
    expect(rem * 16).toBeGreaterThan(236)
    expect(rem * 16).toBeLessThanOrEqual(304)
  })

  it('puts Share in the card’s bottom corner, beside the Page name, not on a row of its own', () => {
    render(<BrowseResultCard result={post({ postKind: 'event', headline: 'Pumpkin bread is back' })} now={NOW} />)
    const share = screen.getByTestId('browse-post-share').parentElement!
    expect(share.className).toMatch(/absolute/)
    expect(share.className).toMatch(/bottom-/)
    expect(share.className).not.toMatch(/-mt-/)
    // The Page name's row leaves room for the 44px button (padding 12 + 40 ≥ 6 + 44).
    expect(screen.getByTestId('tile-kind-row').className).toMatch(/\bpr-10\b/)
    // Beside the photo in a wide card, never on top of it.
    expect(share.className).toMatch(/@\[18rem\]:right-\[6\.25rem\]/)
    expect(screen.getByTestId('tile-card').className).toMatch(/relative/)
  })

  it('a venue show says what kind of show and where, and its headline is the act', () => {
    render(
      <BrowseResultCard
        result={post({ name: 'The Old Ironsides', postKind: 'event', headline: null, tags: ['Live music'], startsAt: '2026-10-25T04:00:00Z', locationLabel: '1901 10th St', body: "Emo Night with DJ Somebody at The Old Ironsides\n\nShow 9pm\n\nFrom The Old Ironsides's own calendar: https://example.test" })}
        now={NOW}
      />,
    )
    expect(screen.getByTestId('browse-post-lead')).toHaveTextContent(/^Live music · Sat 9pm · The Old Ironsides$/)
    expect(screen.getByTestId('tile-title')).toHaveTextContent(/^Emo Night with DJ Somebody$/)
  })
})
