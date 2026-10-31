import { describe, it, expect } from 'vitest'
import { leadLine, cardHeadline } from './lead-line'

// Thu 2026-10-29 10:00 in Sacramento.
const NOW = new Date('2026-10-29T17:00:00Z')
const SAT_5PM = '2026-10-31T00:00:00Z' // Fri 5pm PT
const SAT_5PM_PT = '2026-11-01T00:00:00Z' // Sat 5pm PT
const SAT_8PM_PT = '2026-11-01T03:00:00Z'

describe('plan #230 — the card lead line: KIND · WHEN · WHERE, from fields only', () => {
  it('an event leads with its start and its range', () => {
    expect(leadLine({ kind: 'event', startsAt: SAT_5PM_PT, endsAt: SAT_8PM_PT, where: 'Midtown' }, NOW)).toBe('Event · Sat 5–8pm · Midtown')
  })

  it('a reminder says its next time', () => {
    expect(leadLine({ kind: 'reminder', startsAt: SAT_5PM }, NOW)).toBe('Reminder · Fri 5pm')
  })

  it('a date more than a week out names the month and day', () => {
    expect(leadLine({ kind: 'event', startsAt: '2026-11-14T02:00:00Z' }, NOW)).toBe('Event · Nov 13 6pm')
  })

  it('today reads as today', () => {
    expect(leadLine({ kind: 'event', startsAt: '2026-10-30T02:00:00Z' }, NOW)).toBe('Event · Today 7pm')
  })

  it('a sale says through its end day', () => {
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString(), endsAt: '2026-11-02T06:00:00Z', where: 'East Sac' }, NOW)).toBe('Sale · Through Sun · East Sac')
  })

  it('a sale with no end runs 7 days from its start', () => {
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString() }, NOW)).toBe('Sale · Through Nov 5')
  })

  it('news, limited and hiring carry the day they were posted', () => {
    const postedAt = '2026-10-27T17:00:00Z'
    expect(leadLine({ kind: 'news', postedAt }, NOW)).toBe('News · Tue')
    expect(leadLine({ kind: 'limited', postedAt, where: 'Midtown' }, NOW)).toBe('Limited · Tue · Midtown')
    expect(leadLine({ kind: 'hiring', postedAt }, NOW)).toBe('Hiring · Tue')
  })

  it('without a posted day, the when is omitted rather than invented', () => {
    expect(leadLine({ kind: 'news' }, NOW)).toBe('News')
  })

  it('a Wonder counts who is in toward its threshold', () => {
    expect(leadLine({ kind: 'wonder', wonder: { in: 12, threshold: 30 } }, NOW)).toBe('Count me in · 12 of 30')
    expect(leadLine({ kind: 'wonder' }, NOW)).toBe('Count me in')
  })

  it('a sample says Sample once, in front of the kind', () => {
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString(), endsAt: '2026-11-02T06:00:00Z', sample: true }, NOW)).toBe('Sample sale · Through Sun')
  })
})

describe('plan #230 — the card headline is one line, never the Page name', () => {
  it('uses the headline when there is one', () => {
    expect(cardHeadline({ headline: ' Free tasting of the fall lineup. ', body: 'Long body', pageName: 'Folsom Coffee' })).toBe('Free tasting of the fall lineup.')
  })

  it('falls back to the first sentence of the body for an older post', () => {
    expect(cardHeadline({ headline: null, body: 'Sourdough is back Friday. Come early.\nMore.', pageName: 'Maya Bakes' })).toBe('Sourdough is back Friday.')
  })

  it('strips a leading Sample marker and the Page name', () => {
    expect(
      cardHeadline({ headline: null, body: 'Sample · Tasting at Folsom Coffee: free samples, the new seasonal lineup.', pageName: 'Folsom Coffee' }),
    ).toBe('Tasting at Folsom Coffee: free samples, the new seasonal lineup.')
    expect(cardHeadline({ headline: null, body: 'Folsom Coffee: new beans are in.', pageName: 'Folsom Coffee' })).toBe('New beans are in.')
  })

  it('keeps a long first sentence whole for the card to truncate to one line', () => {
    const long = 'x'.repeat(200)
    expect(cardHeadline({ headline: null, body: long, pageName: 'P' })).toBe(long)
  })

  it('is empty for an empty post', () => {
    expect(cardHeadline({ headline: null, body: null, pageName: 'P' })).toBe('')
  })
})
