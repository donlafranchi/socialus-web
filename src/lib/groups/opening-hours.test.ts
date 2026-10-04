// #293 — a Page's weekly opening hours.
import { describe, it, expect } from 'vitest'
import { parseOpeningHours, weekFromToday, hoursStatus, DAYS } from './opening-hours'

describe('parseOpeningHours', () => {
  it('keeps valid ranges per day and drops empty days', () => {
    expect(parseOpeningHours({ mon: [{ open: '07:00', close: '15:00' }], tue: [] })).toEqual({
      mon: [{ open: '07:00', close: '15:00' }],
    })
  })
  it('allows a split day', () => {
    const v = { sat: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '17:00' }] }
    expect(parseOpeningHours(v)).toEqual(v)
  })
  it('refuses a close before its open, an unknown day, or a bad time', () => {
    expect(() => parseOpeningHours({ mon: [{ open: '15:00', close: '07:00' }] })).toThrow()
    expect(() => parseOpeningHours({ funday: [{ open: '07:00', close: '15:00' }] })).toThrow()
    expect(() => parseOpeningHours({ mon: [{ open: '7am', close: '15:00' }] })).toThrow()
    expect(() => parseOpeningHours([])).toThrow()
  })
  it('null or an empty week is no hours at all', () => {
    expect(parseOpeningHours(null)).toBeNull()
    expect(parseOpeningHours({})).toBeNull()
  })
})

describe('weekFromToday', () => {
  it('starts on today, in the metro, and marks unstated days', () => {
    // 2026-10-01 is a Thursday.
    const rows = weekFromToday({ thu: [{ open: '07:00', close: '15:00' }] }, new Date('2026-10-01T18:00:00Z'))
    expect(rows.map((r) => r.day)).toEqual(['thu', 'fri', 'sat', 'sun', 'mon', 'tue', 'wed'])
    expect(rows[0]).toMatchObject({ today: true, text: '7am–3pm' })
    expect(rows[1]).toMatchObject({ today: false, text: 'Closed' })
    expect(DAYS).toHaveLength(7)
  })
})

// #344 — the one line the collapsed hours show, in the metro's wall clock.
describe('hoursStatus', () => {
  const at = (pdt: string) => new Date(`2026-10-01T${pdt}:00-07:00`) // a Thursday
  const week = { thu: [{ open: '07:00', close: '15:00' }], fri: [{ open: '08:00', close: '12:30' }] }

  it('open now says when it closes', () => {
    expect(hoursStatus(week, at('11:00'))).toEqual({ open: true, text: 'Open now · Closes 3pm' })
  })

  it('before opening today says when it opens, without a day', () => {
    expect(hoursStatus(week, at('06:00'))).toEqual({ open: false, text: 'Closed · Opens 7am' })
  })

  it('after closing says the next day it opens', () => {
    expect(hoursStatus(week, at('16:00'))).toEqual({ open: false, text: 'Closed · Opens 8am Fri' })
  })

  it('between two ranges on a split day, opens again today', () => {
    const split = { thu: [{ open: '07:00', close: '11:00' }, { open: '13:00', close: '15:00' }] }
    expect(hoursStatus(split, at('12:00'))).toEqual({ open: false, text: 'Closed · Opens 1pm' })
  })

  it('open one day a week, after closing, opens next week on that day', () => {
    expect(hoursStatus({ thu: week.thu }, at('16:00'))).toEqual({ open: false, text: 'Closed · Opens 7am Thu' })
  })

  it('closing at the stroke of the hour is closed', () => {
    expect(hoursStatus(week, at('15:00'))?.open).toBe(false)
  })

  it('reads the metro clock, not the server clock', () => {
    // 01:00 UTC Friday is 18:00 Thursday in Sacramento: closed, opening Friday.
    expect(hoursStatus(week, new Date('2026-10-02T01:00:00Z'))?.text).toBe('Closed · Opens 8am Fri')
  })
})
