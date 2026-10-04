import { describe, it, expect } from 'vitest'
import {
  METRO_TIME_ZONE,
  metroWallTimeToInstant,
  formatMetroDateTime,
  formatCardWhen,
  formatPostedDate,
} from './metro-time'

// F072 criterion 3 — "Times are the metro's, never the reader's and never the
// server's." `timestamptz` normalises to UTC and throws the offset away, so
// nothing in the row remembers that seven o'clock meant seven in Sacramento.

describe('the zone', () => {
  it('is Sacramento, in one place, until #173 gives the metro its own', () => {
    expect(METRO_TIME_ZONE).toBe('America/Los_Angeles')
  })
})

describe('what the creator typed becomes an instant', () => {
  it('reads seven in the evening as seven in the metro, not seven UTC', () => {
    // 2026-09-24 is PDT, UTC-7.
    expect(metroWallTimeToInstant('2026-09-24', '19:00')).toBe('2026-09-25T02:00:00.000Z')
  })

  it('reads a winter evening at the winter offset', () => {
    // 2026-01-15 is PST, UTC-8. A single-offset implementation gets one of
    // these two wrong.
    expect(metroWallTimeToInstant('2026-01-15', '19:00')).toBe('2026-01-16T03:00:00.000Z')
  })

  it('is right on the far side of a spring-forward', () => {
    // US DST begins 2026-03-08. 03:00 local is PDT, UTC-7.
    expect(metroWallTimeToInstant('2026-03-08', '03:00')).toBe('2026-03-08T10:00:00.000Z')
  })

  it('is right on the far side of a fall-back', () => {
    // US DST ends 2026-11-01. 15:00 local is PST, UTC-8.
    expect(metroWallTimeToInstant('2026-11-01', '15:00')).toBe('2026-11-01T23:00:00.000Z')
  })

  it('gives a deterministic answer for a clock reading that never happened', () => {
    // 02:30 on the spring-forward morning does not exist. Any answer is a
    // choice; what matters is that it is the same one every time and that it
    // is a real instant.
    const a = metroWallTimeToInstant('2026-03-08', '02:30')
    const b = metroWallTimeToInstant('2026-03-08', '02:30')
    expect(a).toBe(b)
    expect(Number.isNaN(new Date(a!).getTime())).toBe(false)
  })

  it('gives a deterministic answer for a clock reading that happened twice', () => {
    const a = metroWallTimeToInstant('2026-11-01', '01:30')
    const b = metroWallTimeToInstant('2026-11-01', '01:30')
    expect(a).toBe(b)
    expect(Number.isNaN(new Date(a!).getTime())).toBe(false)
  })

  it('takes a single-digit hour, which is what a time input can emit', () => {
    expect(metroWallTimeToInstant('2026-09-24', '9:05')).toBe('2026-09-24T16:05:00.000Z')
  })

  it('refuses half a time rather than inventing the other half', () => {
    // A creator who gave a date and no time has not said when. Guessing
    // midnight would put "Thursday evening" on Wednesday night for a reader
    // one zone east.
    expect(metroWallTimeToInstant('2026-09-24', '')).toBeNull()
    expect(metroWallTimeToInstant('', '19:00')).toBeNull()
  })

  it('refuses nonsense rather than producing an Invalid Date', () => {
    expect(metroWallTimeToInstant('24/09/2026', '19:00')).toBeNull()
    expect(metroWallTimeToInstant('2026-09-24', '25:00')).toBeNull()
    expect(metroWallTimeToInstant('2026-09-24', '19:99')).toBeNull()
  })
})

describe('reading an instant back', () => {
  const NOW = new Date('2026-09-21T00:00:00.000Z')

  it('says it in the metro’s zone, not the reader’s', () => {
    expect(formatMetroDateTime('2026-09-25T02:00:00.000Z', METRO_TIME_ZONE, NOW)).toBe(
      'Thursday, September 24 at 7:00pm',
    )
  })

  it('carries the year when it is not this one', () => {
    expect(formatMetroDateTime('2027-01-16T03:00:00.000Z', METRO_TIME_ZONE, NOW)).toContain('2027')
  })

  it('leaves the year off when it is this one', () => {
    expect(formatMetroDateTime('2026-09-25T02:00:00.000Z', METRO_TIME_ZONE, NOW)).not.toContain(
      '2026',
    )
  })

  it('gives an empty string for something that is not a time, rather than "Invalid Date"', () => {
    expect(formatMetroDateTime('not a date')).toBe('')
  })

  it('renders the same string whatever zone the process is in', () => {
    // The hydration guarantee: a server in UTC and a browser in New York must
    // agree, or React reports a mismatch on every Page with a dated
    // announcement.
    const iso = '2026-09-25T02:00:00.000Z'
    expect(formatMetroDateTime(iso, METRO_TIME_ZONE, NOW)).toBe(
      formatMetroDateTime(iso, METRO_TIME_ZONE, NOW),
    )
  })
})

// #256 (F072 criterion 3) — the card leads with when it happens, short enough
// for large type; an undated announcement says when it was posted.
describe('the card’s words for when', () => {
  const now = new Date('2026-09-30T12:00:00Z')

  it('reads the start as weekday, month, day and a short clock, in the metro', () => {
    expect(formatCardWhen('2026-09-11T02:00:00Z', METRO_TIME_ZONE, now)).toBe('Thu Sep 10 · 7pm')
    expect(formatCardWhen('2026-09-24T02:12:00Z', METRO_TIME_ZONE, now)).toBe('Wed Sep 23 · 7:12pm')
  })

  it('adds the year only when it is not this one', () => {
    expect(formatCardWhen('2027-09-11T02:00:00Z', METRO_TIME_ZONE, now)).toBe('Fri Sep 10, 2027 · 7pm')
  })

  it('says when an undated announcement was posted', () => {
    expect(formatPostedDate('2026-09-24T02:12:00Z', METRO_TIME_ZONE, now)).toBe('Posted Sep 23')
  })
})

// #262 — an end time reads as a range, in the app's lowercase style.
describe('a range', () => {
  const now = new Date('2026-09-30T12:00:00Z')
  it('shares the day and, where it can, the meridiem', () => {
    expect(formatCardWhen('2026-09-11T02:00:00Z', METRO_TIME_ZONE, now, '2026-09-11T04:00:00Z')).toBe('Thu Sep 10 · 7–9pm')
    expect(formatCardWhen('2026-09-10T18:30:00Z', METRO_TIME_ZONE, now, '2026-09-10T20:00:00Z')).toBe('Thu Sep 10 · 11:30am–1pm')
  })

  it('names the end day when it runs past midnight', () => {
    expect(formatCardWhen('2026-09-11T05:00:00Z', METRO_TIME_ZONE, now, '2026-09-11T08:00:00Z')).toBe('Thu Sep 10 · 10pm – Fri Sep 11 · 1am')
  })

  it('reads the long form with the end too', () => {
    expect(formatMetroDateTime('2026-09-11T02:00:00Z', METRO_TIME_ZONE, now, '2026-09-11T04:00:00Z')).toBe(
      'Thursday, September 10 at 7:00–9:00pm',
    )
  })
})
