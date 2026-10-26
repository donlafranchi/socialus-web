// #592 (F074.1) — a series is weekly on one or more chosen weekdays, with an optional start date and
// an optional end date. Nothing else is offered: no monthly, no interval, no nth weekday.

import { describe, it, expect } from 'vitest'
import { SERIES_WEEKDAYS, seriesSchema, firstOccurrenceDate, isoWeekdayOf } from './series'

describe('the weekday chips', () => {
  // [guards F074.1 partial: weekly on chosen weekdays, Monday to Sunday, and no other pattern]
  it('are the seven weekdays, Monday first, ISO numbered', () => {
    expect(SERIES_WEEKDAYS.map((d) => [d.n, d.short, d.long])).toEqual([
      [1, 'Mon', 'Monday'], [2, 'Tue', 'Tuesday'], [3, 'Wed', 'Wednesday'], [4, 'Thu', 'Thursday'],
      [5, 'Fri', 'Friday'], [6, 'Sat', 'Saturday'], [7, 'Sun', 'Sunday'],
    ])
  })
})

describe('seriesSchema', () => {
  it('takes one or more weekdays, with the start and end optional', () => {
    expect(seriesSchema.parse({ weekdays: [4] })).toEqual({ weekdays: [4] })
    expect(seriesSchema.parse({ weekdays: [6, 2], startsOn: '2026-06-01', endsOn: '2026-09-30' })).toEqual({
      weekdays: [2, 6], startsOn: '2026-06-01', endsOn: '2026-09-30',
    })
  })

  // [guards F074.1 partial: no individual dates, no other pattern]
  it('refuses no weekday, a weekday that is not one, and anything but a weekly pattern', () => {
    expect(() => seriesSchema.parse({ weekdays: [] })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [0] })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [8] })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [1], every: 2 })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [1], dates: ['2026-06-02'] })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [1], pattern: 'monthly' })).toThrow()
  })

  it('counts a weekday once however many times it is sent', () => {
    expect(seriesSchema.parse({ weekdays: [4, 4, 4] }).weekdays).toEqual([4])
  })

  it('refuses an end before the start, and dates that are not dates', () => {
    expect(() => seriesSchema.parse({ weekdays: [1], startsOn: '2026-06-02', endsOn: '2026-06-01' })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [1], startsOn: '2026-02-30' })).toThrow()
    expect(() => seriesSchema.parse({ weekdays: [1], endsOn: 'soon' })).toThrow()
    expect(seriesSchema.parse({ weekdays: [1], startsOn: '2026-06-01', endsOn: '2026-06-01' }).endsOn).toBe('2026-06-01')
  })
})

describe('firstOccurrenceDate', () => {
  // 2026-10-12 is a Monday.
  it('is today when today is a chosen weekday', () => {
    expect(isoWeekdayOf('2026-10-12')).toBe(1)
    expect(firstOccurrenceDate([1, 4], null, '2026-10-12')).toBe('2026-10-12')
  })

  it('is the next chosen weekday after today', () => {
    expect(firstOccurrenceDate([4], null, '2026-10-12')).toBe('2026-10-15')
    expect(firstOccurrenceDate([1], null, '2026-10-13')).toBe('2026-10-19')
  })

  it('starts no earlier than the start date', () => {
    expect(firstOccurrenceDate([6], '2026-11-01', '2026-10-12')).toBe('2026-11-07')
  })

  it('ignores a start date in the past', () => {
    expect(firstOccurrenceDate([4], '2026-01-01', '2026-10-12')).toBe('2026-10-15')
  })

  it('steps over a month and a year end', () => {
    expect(firstOccurrenceDate([5], null, '2026-12-29')).toBe('2027-01-01')
  })
})
