import { describe, it, expect } from 'vitest'
import { buildIcs, cardImageAlt } from './ics'

// #260 — "Add to calendar" downloads a standard .ics built from what the page
// already shows; card images get alt text from the card's own words.

const EVENT = {
  uid: 'post-1@socialus.org',
  title: 'Bread class; bring flour, an apron',
  start: '2026-09-11T02:00:00Z',
  location: 'Church Hall, 12 Broadway',
  url: 'https://www.socialus.org/g/b-bakery#announcement-post-1',
  now: new Date('2026-09-30T12:00:00Z'),
}

describe('buildIcs', () => {
  it('is one VEVENT in a VCALENDAR, with CRLF line ends', () => {
    const ics = buildIcs(EVENT)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics).toContain('\r\nBEGIN:VEVENT\r\n')
    expect(ics.trimEnd().endsWith('END:VEVENT\r\nEND:VCALENDAR')).toBe(true)
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
  })

  it('carries the start in UTC, and no end it was not given', () => {
    const ics = buildIcs(EVENT)
    expect(ics).toContain('\r\nDTSTART:20260911T020000Z\r\n')
    expect(ics).not.toContain('DTEND')
    expect(buildIcs({ ...EVENT, end: '2026-09-11T04:00:00Z' })).toContain('\r\nDTEND:20260911T040000Z\r\n')
  })

  it('escapes what the format reserves', () => {
    const ics = buildIcs(EVENT)
    expect(ics).toContain('SUMMARY:Bread class\; bring flour\\, an apron')
    expect(ics).toContain('LOCATION:Church Hall\\, 12 Broadway')
  })

  it('leaves out a place it was not given', () => {
    expect(buildIcs({ ...EVENT, location: null })).not.toContain('LOCATION')
  })

  it('names its UID, stamp and link', () => {
    const ics = buildIcs(EVENT)
    expect(ics).toContain('UID:post-1@socialus.org')
    expect(ics).toContain('DTSTAMP:20260930T120000Z')
    expect(ics).toContain('URL:https://www.socialus.org/g/b-bakery#announcement-post-1')
  })
})

describe('cardImageAlt', () => {
  it('is the title, then the date, then the place, of what the card already shows', () => {
    expect(cardImageAlt({ title: 'Run Club', when: 'Thu Sep 10 · 7pm', place: 'Church Hall' })).toBe(
      'Run Club, Thu Sep 10 · 7pm, Church Hall',
    )
  })

  it('leaves out what the card does not show', () => {
    expect(cardImageAlt({ title: 'Run Club', when: null, place: null })).toBe('Run Club')
  })
})
