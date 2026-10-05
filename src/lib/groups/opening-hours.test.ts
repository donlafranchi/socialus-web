// #293 — a Page's weekly opening hours.
import { describe, it, expect } from 'vitest'
import { parseOpeningHours, weekFromToday, DAYS } from './opening-hours'

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
