import { describe, expect, it } from 'vitest'
import { getWithRetries, instant, isAggregator, parseIcal, parseJsonLd, parseTribe, showBody, showKey, upcoming } from './venue-events'

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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HTML_PARSERS } from './venue-events'
describe('Channel 24 parser (real page, 2026-10-22)', () => {
  it('reads every show, Modest Mouse with doors and its own ticket link', () => {
    const shows = HTML_PARSERS.channel24!(readFileSync(join(__dirname, 'fixtures/channel-24.html'), 'utf8'), 'https://channel24sac.com/calendar/')
    expect(shows.length).toBeGreaterThan(30)
    const mm = shows.find((s) => s.title.startsWith('Modest Mouse'))!
    expect(mm.title).toBe('Modest Mouse with Caroline Rose')
    expect(mm.startsAt.toISOString()).toBe('2026-10-24T03:00:00.000Z')
    expect(mm.doorsAt!.toISOString()).toBe('2026-10-24T02:00:00.000Z')
    expect(mm.ticketUrl).toMatch(/^https:\/\//)
  })
})

describe('getWithRetries (#1044)', () => {
  const ok = (body = 'page') => new Response(body, { status: 200 })
  const run = (answers: (Response | Error)[]) => {
    const waits: number[] = []
    let n = 0
    const f = async () => {
      const a = answers[n++]!
      if (a instanceof Error) throw a
      return a
    }
    return { waits, tries: () => n, read: () => getWithRetries('https://v.test/', f, async (ms) => void waits.push(ms)) }
  }
  it('reads a page that answers 504 twice and then 200', async () => {
    const r = run([new Response('', { status: 504 }), new Response('', { status: 502 }), ok('shows')])
    expect(await r.read()).toBe('shows')
    expect(r.waits).toEqual([5000, 15000])
  })
  it('retries a dead connection too, and gives up after three tries with the last error', async () => {
    const r = run([new Error('fetch failed'), new Response('', { status: 504 }), new Response('', { status: 503 })])
    await expect(r.read()).rejects.toThrow('HTTP 503')
    expect(r.tries()).toBe(3)
  })
  it('does not retry the venue saying no: 403, 404 or 429', async () => {
    for (const status of [403, 404, 429]) {
      const r = run([new Response('', { status })])
      await expect(r.read()).rejects.toThrow(status === 429 ? 'rate limited' : `HTTP ${status}`)
      expect(r.tries()).toBe(1)
    }
  })
})

describe('imageUrl', () => {
  it('reads a JSON-LD image that is a URL, an ImageObject or a list, resolved against the page', () => {
    const html = (img: string) => `<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-11-01T20:00:00-07:00","image":${img}}</script>`
    expect(parseJsonLd(html('"/i/a.jpg"'), 'https://v.test/e')[0]!.imageUrl).toBe('https://v.test/i/a.jpg')
    expect(parseJsonLd(html('{"@type":"ImageObject","url":"https://cdn.test/b.jpg"}'), 'https://v.test/e')[0]!.imageUrl).toBe('https://cdn.test/b.jpg')
    expect(parseJsonLd(html('["https://cdn.test/c.jpg","https://cdn.test/d.jpg"]'), 'https://v.test/e')[0]!.imageUrl).toBe('https://cdn.test/c.jpg')
    expect(parseJsonLd(html('null'), 'https://v.test/e')[0]!.imageUrl).toBeUndefined()
  })
})

describe('showBody', () => {
  const s = { title: 'Act', startsAt: new Date('2026-11-01T03:00:00Z') }
  it('credits the picture when it has one', () => {
    expect(showBody('Hall', s, 'https://h.test/e', 'Hall (from their website)')).toMatch(/\n\nPhoto: Hall \(from their website\)$/)
    expect(showBody('Hall', s, 'https://h.test/e')).not.toMatch(/Photo:/)
  })
})
