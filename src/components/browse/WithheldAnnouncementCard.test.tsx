// F093 criteria 4, 10 and 11 — what a stranger actually sees.
//
// None of this discharges criterion 1. The scenario is explicit that no "the
// component does not render it" test does, and the body never reaches this
// component to be rendered: `announcements_withheld` has no such column.
// What these tests hold is the other direction — that the card says the four
// things it is allowed to say and does not grow a fifth.

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
  announcement_count: 3,
  updated_at: '2026-09-23T16:00:00.000Z',
})

afterEach(cleanup)

describe('WithheldAnnouncementCard', () => {
  it('names the Page', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByText('SacRiver Floaters')).toBeTruthy()
  })

  it('says that the Page posted an announcement', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-what').textContent).toBe('Posted an announcement')
  })

  it('says how many, and names the period in words', () => {
    // Criterion 5 — a count that cannot be read as a period is not a count.
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe('3 announcements this week')
  })

  it('says one announcement rather than 1 announcements', () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, announcementCount: 1 }} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe('1 announcement this week')
  })

  it('shows no count line at all when the Page has none this period', () => {
    // "0 announcements this week" beside "posted an announcement" is a
    // contradiction on its face. The card still exists — that something is
    // happening is the public part — it just does not carry a nought.
    render(<WithheldAnnouncementCard result={{ ...RESULT, announcementCount: 0 }} />)
    expect(screen.queryByTestId('withheld-count')).toBeNull()
  })

  it('asks the reader in', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-cta').textContent).toBe('Become a member to read it')
  })

  it('points the ask at signing up', () => {
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-cta').getAttribute('href')).toBe('/auth/signup')
  })

  it('carries nothing else — no body, no time, no place', () => {
    // Criterion 4: exactly four things. Asserted as a whole-card text match
    // rather than four absences, so a fifth line added later fails here even
    // though nobody thought to write a test forbidding it.
    const { container } = render(<WithheldAnnouncementCard result={RESULT} />)
    expect(container.textContent).toBe(
      'SacRiver FloatersPosted an announcement3 announcements this weekBecome a member to read it',
    )
  })

  it('is the same for every anonymous reader', () => {
    // Criterion 11 — no personalisation, nothing derived from a prior visit,
    // and in particular nothing formatted in the reader's own timezone. The
    // card carries no date at all, so this holds by having nothing to vary;
    // the test is here so that adding one is not silent.
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

  it('links to the announcement it names, not to a body', () => {
    // Criterion 10. Where it goes is the Page's own withheld card for this
    // announcement (criterion 9) — something a signed-out reader CAN read.
    render(<WithheldAnnouncementCard result={RESULT} />)
    expect(screen.getByTestId('withheld-link').getAttribute('href')).toBe(
      '/g/sacriver-floaters-3k8x0p#announcement-11111111-1111-4111-8111-111111111111',
    )
  })

  it('renders no link when the Page has no address', () => {
    render(<WithheldAnnouncementCard result={{ ...RESULT, href: null }} />)
    expect(screen.queryByTestId('withheld-link')).toBeNull()
    // The ask survives the missing link — it is the point of the card.
    expect(screen.getByTestId('withheld-cta')).toBeTruthy()
  })
})
