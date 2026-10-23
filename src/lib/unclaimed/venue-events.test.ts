import { describe, expect, it } from 'vitest'
import { instant, isAggregator, parseIcal, parseJsonLd, parseTribe, showBody, showKey, upcoming } from './venue-events'

const now = new Date('2026-10-22T15:00:00Z')

describe('instant', () => {
  it('reads an offset exactly and a bare wall time as Pacific', () => {
    expect(instant('2026-10-23T20:00:00-07:00')!.toISOString()).toBe('2026-10-24T03:00:00.000Z')
    expect(instant('2026-10-23T20:00')!.toISOString()).toBe('2026-10-24T03:00:00.000Z')
    expect(instant('2026-11-20 19:30:00')!.toISOString()).toBe('2026-11-21T03:30:00.000Z')
  })
  it('gives no time for a bare date, never an invented one', () => {
    expect(instant('2026-10-23')).toBeNull()
  })
})

describe('parseJsonLd', () => {
  const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"MusicEvent","name":"Modest Mouse &amp; Friends","startDate":"2026-10-23T20:00:00-07:00","doorTime":"19:00",
     "offers":[{"@type":"Offer","url":"/tickets/mm"}]},
    {"@type":"Event","name":"Cancelled Act","startDate":"2026-10-25T20:00","eventStatus":"https://schema.org/EventCancelled","url":"https://venue.test/c"},
    {"@type":"Organization","name":"Not a show"}]}</script>
    <script type="application/ld+json">{broken</script></html>`
  const shows = parseJsonLd(html, 'https://venue.test/events')
  it('finds every Event, decodes names and resolves ticket links', () => {
    expect(shows).toHaveLength(2)
    expect(shows[0]).toMatchObject({ title: 'Modest Mouse & Friends', ticketUrl: 'https://venue.test/tickets/mm', cancelled: false })
    expect(shows[0]!.doorsAt!.toISOString()).toBe('2026-10-24T02:00:00.000Z')
    expect(shows[1]!.cancelled).toBe(true)
  })
  it('posts only what is ahead, within 60 days, not cancelled', () => {
    const later = { title: 'Far off', startsAt: new Date('2027-01-30T04:00:00Z') }
    const past = { title: 'Gone', startsAt: new Date('2026-10-20T04:00:00Z') }
    expect(upcoming([...shows, later, past, shows[0]!], now).map((s) => s.title)).toEqual(['Modest Mouse & Friends'])
  })
})

describe('parseIcal', () => {
  it('reads timed VEVENTs, unfolded, and skips all-day ones', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Jazz\\, late set\r\nDTSTART;TZID=America/Los_Angeles:20261024T213000\r\nURL:https://v.test/\r\n e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Closed\r\nDTSTART;VALUE=DATE:20261025\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:UTC show\r\nDTSTART:20261026T030000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const shows = parseIcal(ics, 'https://v.test/cal.ics')
    expect(shows.map((s) => s.title)).toEqual(['Jazz, late set', 'UTC show'])
    expect(shows[0]!.startsAt.toISOString()).toBe('2026-10-25T04:30:00.000Z')
    expect(shows[0]!.ticketUrl).toBe('https://v.test/e/1')
    expect(shows[1]!.cancelled).toBe(true)
  })
})

describe('parseTribe', () => {
  it('reads The Events Calendar REST events in UTC', () => {
    const shows = parseTribe({ events: [{ title: 'Open &#038; Mic', utc_start_date: '2026-10-24 02:00:00', url: 'https://v.test/e', website: 'https://tix.test/1' }, { title: 'All day', all_day: true, start_date: '2026-10-24 00:00:00' }] }, 'https://v.test')
    expect(shows).toHaveLength(1)
    expect(shows[0]).toMatchObject({ title: 'Open & Mic', ticketUrl: 'https://tix.test/1' })
    expect(shows[0]!.startsAt.toISOString()).toBe('2026-10-24T02:00:00.000Z')
  })
})

describe('keys and words', () => {
  const s = { title: 'Modest Mouse', startsAt: new Date('2026-10-24T03:00:00Z'), doorsAt: new Date('2026-10-24T02:00:00Z') }
  it('keys one post per Pacific night and title, whatever the punctuation', () => {
    expect(showKey(s)).toBe('2026-10-23|modest mouse')
    expect(showKey({ ...s, title: 'MODEST  MOUSE!' })).toBe(showKey(s))
  })
  it('says doors and show and credits the venue calendar', () => {
    expect(showBody('Channel 24', s, 'https://channel24sac.com/events')).toBe('Modest Mouse at Channel 24\n\nDoors 7 PM · Show 8 PM\n\nFrom Channel 24\'s own calendar: https://channel24sac.com/events')
  })
  it('refuses aggregators as a source', () => {
    expect(isAggregator('https://www.songkick.com/venues/1')).toBe(true)
    expect(isAggregator('https://channel24sac.com/events')).toBe(false)
  })
})

import { robotsAllows } from './venue-events'
describe('robotsAllows', () => {
  it('follows the star group, the longest rule winning', () => {
    const r = 'User-agent: *\nDisallow: /wp-admin/\nDisallow: /events/private\nAllow: /events/private/ok\n\nUser-agent: GPTBot\nDisallow: /'
    expect(robotsAllows(r, '/events/')).toBe(true)
    expect(robotsAllows(r, '/events/private/x')).toBe(false)
    expect(robotsAllows(r, '/events/private/ok')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow: /', '/events')).toBe(false)
    expect(robotsAllows('User-agent: SocialUsBot\nDisallow: /\nUser-agent: *\nAllow: /', '/events')).toBe(false)
    expect(robotsAllows('', '/x')).toBe(true)
  })
})
