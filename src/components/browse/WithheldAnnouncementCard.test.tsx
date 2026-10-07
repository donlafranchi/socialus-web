// F093 criteria 4, 5, 10 and 11 — what a stranger sees on Explore.
//
// None of this discharges criterion 1: the body never reaches this component
// (`announcements_withheld` has no such column). These hold the other
// direction — the card says what it may and does not grow another line.

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WithheldAnnouncementCard } from './WithheldAnnouncementCard'
import { mapWithheldRow } from '@/lib/feed/withheld-announcements'

const RESULT = mapWithheldRow({
  result_id: '11111111-1111-4111-8111-111111111111',
  group_id: '22222222-2222-4222-8222-222222222222',
  slug: 'sacriver-floaters',
  name: 'SacRiver Floaters',
  public_id: '3k8x0p',
  photo_url: 'https://example.test/floaters.jpg',
  announcement_count: 3,
  announcement_ids: ['11111111-1111-4111-8111-111111111111'],
  updated_at: '2026-09-23T16:00:00.000Z',
})

afterEach(cleanup)

describe('WithheldAnnouncementCard', () => {
  it('names the Page', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('tile-title').textContent).toBe('SacRiver Floaters')
  })

  it("shows the Page's photo", () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('tile-image').querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/floaters.jpg',
    )
  })

  it("shows its kind's default art when the Page has no photo", () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, photoUrl: null }} />)
    expect(screen.getByTestId('default-art')).toBeTruthy()
    expect(screen.queryByTestId('tile-emoji')).toBeNull()
  })

  it('says how many, and names the period in words', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe('3 posts this week')
  })

  it('says one post rather than 1 posts', () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, announcementCount: 1 }} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe('1 post this week')
  })

  it('carries no nought when the Page has none this period', () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, announcementCount: 0 }} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe('A new post')
  })

  it('says who can read it', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-details').textContent).toBe(
      'The details are for members and followers of this Page.',
    )
  })

  it('asks the reader to sign in and become a member, and brings them back to the Page', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    const cta = screen.getByTestId('withheld-cta')
    expect(cta.textContent).toBe("Sign in to see what's happening")
    expect(cta.getAttribute('href')).toBe('/auth/login?next=%2Fg%2F3k8x0p')
  })

  it('carries nothing else — no body, no time, no place', () => {
    // Criterion 4, as a whole-card match so a line added later fails here.
    const { container } = render(<WithheldAnnouncementCard result={RESULT} />)
    expect(container.textContent).toBe(
      "3 posts this weekSacRiver FloatersThe details are for members and followers of this Page.Sign in to see what's happening",
    )
  })

  it('is the same for every anonymous reader', () => {
    // Criterion 11 — nothing formatted in the reader's own timezone.
    const { container: a } = render(<WithheldAnnouncementCard result={RESULT} />)
    const tz = process.env.TZ
    try {
      process.env.TZ = 'Asia/Tokyo'
      const { container: b } = render(<WithheldAnnouncementCard result={RESULT} />)
      expect(b.innerHTML).toBe(a.innerHTML)
    } finally {
      process.env.TZ = tz
    }
  })

  it("links to the Page's withheld card, not to a body", () => {
    // Criterion 10 — somewhere a signed-out reader CAN read.
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-link').getAttribute('href')).toBe(
      '/g/3k8x0p#announcement-11111111-1111-4111-8111-111111111111',
    )
  })

  it('renders no link when the Page has no address, and keeps the ask', () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, href: null }} />)
    expect(screen.queryByTestId('withheld-link')).toBeNull()
    expect(screen.getByTestId('withheld-cta').getAttribute('href')).toBe('/auth/login')
  })
})
