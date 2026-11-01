import { describe, it, expect } from 'vitest'
import { leadLine, leadLineParts, cardHeadline, venueShow } from './lead-line'
import { CALENDAR_LINE } from '@/lib/unclaimed/event-type'
import { showBody } from '@/lib/unclaimed/venue-events'

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
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString(), endsAt: '2026-11-02T06:00:00Z', where: 'East Sac' }, NOW)).toBe('Offer · Through Sun · East Sac')
  })

  it('a sale with no end runs 7 days from its start', () => {
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString() }, NOW)).toBe('Offer · Through Nov 5')
  })

  it('news, limited and hiring carry the day they were posted', () => {
    const postedAt = '2026-10-27T17:00:00Z'
    expect(leadLine({ kind: 'news', postedAt }, NOW)).toBe('Update · Tue')
    expect(leadLine({ kind: 'limited', postedAt, where: 'Midtown' }, NOW)).toBe('Limited · Tue · Midtown')
    expect(leadLine({ kind: 'hiring', postedAt }, NOW)).toBe('Hiring · Tue')
  })

  it('without a posted day, the when is omitted rather than invented', () => {
    expect(leadLine({ kind: 'news' }, NOW)).toBe('Update')
  })

  it('a Proposal counts who is in, toward its goal when it has one', () => {
    expect(leadLine({ kind: 'wonder', wonder: { in: 12, threshold: 30 } }, NOW)).toBe('Proposal · 12 of 30')
    expect(leadLine({ kind: 'wonder', wonder: { in: 4, threshold: null } }, NOW)).toBe('Proposal · 4 in')
    expect(leadLine({ kind: 'wonder' }, NOW)).toBe('Proposal')
  })

  it('a sample says Sample once, in front of the kind', () => {
    expect(leadLine({ kind: 'sale', startsAt: NOW.toISOString(), endsAt: '2026-11-02T06:00:00Z', sample: true }, NOW)).toBe('Sample offer · Through Sun')
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

describe('#1127 — the lead line reads true for every kind', () => {
  it('a limited post with a start leads with that start, never the old day it was posted', () => {
    expect(leadLine({ kind: 'limited', startsAt: '2026-10-31T16:00:00Z', endsAt: '2026-10-31T20:00:00Z', postedAt: '2026-10-09T17:00:00Z', sample: true }, NOW)).toBe('Sample limited · Sat 9am')
  })

  it('splits into what and when (kept whole) and the where (the part a narrow card cuts)', () => {
    expect(leadLineParts({ kind: 'event', startsAt: SAT_5PM_PT, endsAt: SAT_8PM_PT, where: ' Midtown ' }, NOW)).toEqual({ head: 'Event · Sat 5–8pm', where: 'Midtown' })
    expect(leadLineParts({ kind: 'news' }, NOW)).toEqual({ head: 'Update', where: null })
  })

  it('a venue show leads with what kind of show it is and the venue as its where', () => {
    expect(leadLine({ kind: 'event', startsAt: SAT_8PM_PT, show: { type: 'music', venue: 'The Old Ironsides' }, where: '1901 10th St' }, NOW)).toBe('Live music · Sat 8pm · The Old Ironsides')
    expect(leadLine({ kind: 'event', startsAt: SAT_8PM_PT, show: { type: 'comedy', venue: 'Punch Line' } }, NOW)).toBe('Comedy · Sat 8pm · Punch Line')
    expect(leadLine({ kind: 'event', startsAt: SAT_8PM_PT, show: { type: 'theater', venue: 'B Street' } }, NOW)).toBe('Theater · Sat 8pm · B Street')
    expect(leadLine({ kind: 'event', startsAt: SAT_8PM_PT, show: { type: 'other', venue: 'Golden 1 Center' } }, NOW)).toBe('Event · Sat 8pm · Golden 1 Center')
  })
})

describe('#1127 — an imported venue show is recognised from its calendar line', () => {
  const body = (title: string) => `${title} at The Old Ironsides\n\nDoors 8pm · Show 9pm\n\n${CALENDAR_LINE('The Old Ironsides')}https://example.com/cal`
  it('classifies by the title, then the show’s interests', () => {
    expect(venueShow({ body: body('Emo Night'), tags: ['Live music'] })).toEqual({ type: 'music', venue: 'The Old Ironsides' })
    expect(venueShow({ body: body('Stand-up Saturday'), tags: [] })).toEqual({ type: 'comedy', venue: 'The Old Ironsides' })
    expect(venueShow({ body: body('The Nutcracker'), tags: [] })).toEqual({ type: 'theater', venue: 'The Old Ironsides' })
  })

  it('reads the body the venue importer actually writes', () => {
    const real = showBody('Ace of Spades', { title: 'Comedy Night', startsAt: new Date(SAT_8PM_PT) }, 'https://aceofspades.test/cal', 'Unsplash')
    expect(venueShow({ body: real, tags: [] })).toEqual({ type: 'comedy', venue: 'Ace of Spades' })
  })

  it('is null for a post a member wrote, and when the body is withheld', () => {
    expect(venueShow({ body: 'Live music tonight at The Old Ironsides', tags: ['Live music'] })).toBeNull()
    expect(venueShow({ body: null, tags: [] })).toBeNull()
  })

  it('the headline drops the venue the card already names', () => {
    expect(cardHeadline({ headline: null, body: body('Emo Night with DJ Somebody'), pageName: 'The Old Ironsides' })).toBe('Emo Night with DJ Somebody')
  })
})
