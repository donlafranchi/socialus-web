// #1000 — one parser per venue, each tested on that venue's own page as saved on 2026-10-24 (fixtures/, scripts and styles stripped).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HTML_FOLLOW, HTML_PARSERS, parseShows, type VenueShow } from './venue-events'

const NOW = new Date('2026-10-24T18:00:00Z')
const page = (f: string) => readFileSync(join(__dirname, 'fixtures', `${f}.html`), 'utf8')
const run = (parser: string, f: string, base: string, pages: Record<string, string> = {}) => HTML_PARSERS[parser]!(page(f), base, NOW, pages)
const find = (shows: VenueShow[], title: string, day: string) => shows.find((s) => s.title === title && s.startsAt.toISOString().startsWith(day))!
const iso = (d?: Date) => d?.toISOString()

describe('Harlow\'s and the Starlet Room (rhp list, year from the weekday)', () => {
  const base = 'https://www.harlows.com/events/'
  it('keeps only Harlow\'s own room, doors-only shows start at doors, free shows with no time are left out', () => {
    const shows = run('harlows-rhp', 'harlows-events', base)
    expect(shows).toHaveLength(37)
    const v = shows.find((s) => s.title.startsWith('Shannon McCabe'))!
    expect(v.title).toBe('Shannon McCabe’s 18th Annual Vampire Ball')
    expect(iso(v.startsAt)).toBe('2026-10-25T04:00:00.000Z')
    expect(v.doorsAt).toBeUndefined()
    expect(v.ticketUrl).toMatch(/^https:\/\/www\.etix\.com\/ticket\//)
    expect(shows.find((s) => s.title.startsWith('Weatherday'))).toBeUndefined()
  })
  it('reads doors and show, and a cancelled night as cancelled', () => {
    const shows = run('harlows-rhp', 'harlows-events', base)
    const b = shows.find((s) => s.title.startsWith('Blitzkid'))!
    expect(iso(b.doorsAt)).toBe('2026-10-26T02:00:00.000Z')
    expect(iso(b.startsAt)).toBe('2026-10-26T03:00:00.000Z')
    const c = shows.find((s) => s.title.includes('PRAYERS'))!
    expect(c.cancelled).toBe(true)
    expect(c.title).toBe('PRAYERS: No Tengo Calma Tour')
    expect(iso(c.startsAt)).toBe('2026-11-18T03:30:00.000Z')
  })
  it('the Starlet Room gets its own 41', () => {
    const shows = run('harlows-rhp-starlet', 'harlows-events', base)
    expect(shows).toHaveLength(41)
    const w = shows.find((s) => s.title.startsWith('Weatherday'))!
    expect(iso(w.doorsAt)).toBe('2026-10-26T02:00:00.000Z')
    expect(iso(w.startsAt)).toBe('2026-10-26T02:30:00.000Z')
    expect(shows.find((s) => s.title.startsWith('Blitzkid'))).toBeUndefined()
  })
  it('a page that changed shape reads as nothing', () => {
    expect(HTML_PARSERS['harlows-rhp']!('<html>nothing</html>', base, NOW, {})).toEqual([])
  })
})

describe('Golden 1 Center', () => {
  it('reads each date of a multi-date run once, with its own time', () => {
    const shows = run('golden1-eventchamp', 'golden1-events', 'https://www.golden1center.com/events/')
    expect(shows).toHaveLength(78)
    const g = find(shows, 'Grizzlies vs Kings', '2026-10-26')
    expect(iso(g.startsAt)).toBe('2026-10-26T01:00:00.000Z')
    expect(g.ticketUrl).toBe('https://www.golden1center.com/events/detail/grizzlies-vs-kings-102526/')
    const disney = shows.filter((s) => s.title === 'Disney On Ice presents Find Your Hero')
    expect(disney).toHaveLength(7)
    expect(disney.map((s) => iso(s.startsAt))).toContain('2026-10-31T17:30:00.000Z')
  })
})

describe('Goldfield Trading Post', () => {
  it('reads doors as the time, the SeeTickets link, and falls back to the show page when there is no ticket button', () => {
    const shows = run('goldfield', 'goldfield-home', 'https://goldfieldtradingpost.com/')
    expect(shows).toHaveLength(20)
    const t = shows.find((s) => s.title.startsWith('Toxicity'))!
    expect(t.title).toBe('Toxicity: Tribute To System Of A Down with Arch Elders, Taylor Scott')
    expect(iso(t.startsAt)).toBe('2026-10-25T01:30:00.000Z')
    expect(t.ticketUrl).toMatch(/^https:\/\/wl\.seetickets\.us\/event\/toxicity/)
    expect(shows.every((s) => /^https:\/\//.test(s.ticketUrl ?? ''))).toBe(true)
    expect(shows.some((s) => s.ticketUrl!.startsWith('https://goldfieldtradingpost.com/event/'))).toBe(true)
  })
})

describe('The Old Ironsides', () => {
  it('reads full dates and start times', () => {
    const shows = run('old-ironsides', 'old-ironsides-home', 'https://theoldironsides.com/')
    expect(shows).toHaveLength(11)
    const c = shows.find((s) => s.title.startsWith('Coven'))!
    expect(c.title).toBe('Coven: Halloween Costume Party')
    expect(iso(c.startsAt)).toBe('2026-10-25T03:00:00.000Z')
    expect(c.ticketUrl).toMatch(/seetickets/)
    const h = shows.find((s) => s.title.startsWith('Halibut Head'))!
    expect(h.title).toBe('Halibut Head with The Pretty Boys, First Name Basis, The Pretty Pills, Ruining')
    expect(iso(h.startsAt)).toBe('2026-10-26T01:30:00.000Z')
  })
})

describe('The Sofia (music series, time from each detail page)', () => {
  const base = 'https://bstreettheatre.org/shows/'
  it('asks for the music shows inside the 60 days, not the theatre runs', () => {
    expect(HTML_FOLLOW['sofia-music']!(page('sofia-shows'), base, NOW)).toEqual([
      'https://bstreettheatre.org/music/mustache-cleavage/',
      'https://bstreettheatre.org/music/shelley-burns-bill-dendle/',
      'https://bstreettheatre.org/music/the-vivian-lee-band-with-jacam-manricks/',
    ])
  })
  it('takes the time from the detail page and drops a show it has no time for', () => {
    const shows = run('sofia-music', 'sofia-shows', base, { 'https://bstreettheatre.org/music/mustache-cleavage/': page('sofia-music-detail') })
    expect(shows).toHaveLength(1)
    expect(shows[0]!.title).toBe('Mustache & Cleavage – Album Release Show!')
    expect(iso(shows[0]!.startsAt)).toBe('2026-11-14T03:00:00.000Z')
    expect(shows[0]!.ticketUrl).toBe('https://bstreettheatre.org/music/mustache-cleavage/')
  })
})

describe('Fox & Goose (a line in the monthly post)', () => {
  const base = 'https://foxandgoose.com/events/'
  const oct = 'https://foxandgoose.com/events/october-events/'
  it('follows the month page linked from the list', () => {
    expect(HTML_FOLLOW['foxandgoose-monthly']!(page('foxandgoose-events'), base, NOW)).toEqual([oct])
  })
  it('reads dated lines with a time, a linked title, and a time range', () => {
    const shows = run('foxandgoose-monthly', 'foxandgoose-events', base, { [oct]: page('foxandgoose-october') })
    expect(shows).toHaveLength(15)
    expect(iso(find(shows, 'James Regan', '2026-10-25').startsAt)).toBe('2026-10-25T01:00:00.000Z')
    const s = find(shows, 'Rusty Sterling’s Spooky Special', '2026-10-31')
    expect(s.ticketUrl).toBe('https://foxandgoose.com/events/rusty-sterlings-spooky-special/')
    expect(iso(find(shows, 'The Dead Rockstar’s Show', '2026-11-01').startsAt)).toBe('2026-11-01T00:00:00.000Z')
    expect(iso(find(shows, 'Irish Jam', '2026-10-17').startsAt)).toBe('2026-10-17T02:00:00.000Z')
  })
})

describe('The Center for the Arts', () => {
  it('reads month, day, weekday and time, and leaves out the ad card with no date', () => {
    const shows = run('centerforthearts-jet', 'center-for-the-arts-events', 'https://thecenterforthearts.org/events/')
    expect(shows).toHaveLength(24)
    const p = find(shows, 'Paul Thorn', '2026-10-28')
    expect(iso(p.startsAt)).toBe('2026-10-28T02:00:00.000Z')
    expect(p.ticketUrl).toMatch(/salesforce-sites\.com/)
    expect(shows.at(-1)!.startsAt.toISOString().startsWith('2027-01-31')).toBe(true)
  })
})

describe('Harris Center', () => {
  it('reads the timed shows, not the multi-day runs', () => {
    const shows = run('harris-center', 'harris-center-events', 'https://www.harriscenter.net/events?pageSize=30&page=1&showAll=1')
    expect(shows).toHaveLength(35)
    const l = find(shows, 'Lyle Lovett and his Small Large Band', '2026-10-28')
    expect(iso(l.startsAt)).toBe('2026-10-28T02:30:00.000Z')
    expect(l.ticketUrl).toBe('https://www.harriscenter.net/lyle-lovett')
  })
})

describe('Nevada Theatre', () => {
  it('reads the year from the month divider and the time from each show', () => {
    const shows = run('nevada-theatre-mec', 'nevada-theatre-events', 'https://nevadatheatre.com/events/')
    expect(shows).toHaveLength(9)
    expect(iso(find(shows, 'Paul Emery presents Hardly Strictly Celtic', '2026-10-25').startsAt)).toBe('2026-10-25T02:30:00.000Z')
    const h = shows.filter((s) => s.title === 'Paul Emery presents Shakespeare’s Hamlet')
    expect(h.map((s) => iso(s.startsAt))).toContain('2026-10-31T21:00:00.000Z')
    expect(h.map((s) => iso(s.startsAt))).toContain('2026-11-06T03:30:00.000Z')
  })
})

describe('Powerhouse Pub', () => {
  it('reads weekday, date and start; a date whose weekday is wrong on the site is left out', () => {
    const shows = run('powerhouse-elementor', 'powerhouse-events', 'https://powerhousepub.com/events/')
    const b = find(shows, 'Powerhouse of blues – Mitch Woods', '2026-10-25')
    expect(iso(b.startsAt)).toBe('2026-10-25T22:00:00.000Z')
    expect(b.ticketUrl).toBe('https://powerhousepub.com/events/powerhouse-of-blues-169/')
    expect(find(shows, 'Live band Karaoke', '2026-10-28').title).toBe('Live band Karaoke')
    expect(shows.find((s) => s.title === 'Total Recall')).toBeUndefined()
    expect(shows).toHaveLength(49)
  })
})

describe('parseShows with follow pages', () => {
  it('hands the fetched pages and the clock to the parser', () => {
    const src = { url: 'https://foxandgoose.com/events/', format: 'html' as const, parser: 'foxandgoose-monthly' }
    const shows = parseShows(src, page('foxandgoose-events'), NOW, { 'https://foxandgoose.com/events/october-events/': page('foxandgoose-october') })
    expect(shows.length).toBe(15)
  })
})
