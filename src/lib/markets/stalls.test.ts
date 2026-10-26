import { describe, it, expect } from 'vitest'
import { attends, findUsLine, hoursLabel, nextMarketDay, stallReminderBody, vendorsLine } from './stalls'

const pt = (s: string) => new Date(`${s}-07:00`)
const maidu = { weekdays: [7], first: { startsAt: pt('2026-10-25T09:00:00'), endsAt: pt('2026-10-25T13:00:00') } }

describe('nextMarketDay', () => {
  it('is the coming Sunday, at its hours', () => {
    const d = nextMarketDay(maidu, pt('2026-10-21T12:00:00'))!
    expect(d.ymd).toBe('2026-10-25')
    expect(d.startsAt.toISOString()).toBe('2026-10-25T16:00:00.000Z')
    expect(d.endsAt!.toISOString()).toBe('2026-10-25T20:00:00.000Z')
  })
  it('is still today while the market is on, and next week after it ends', () => {
    expect(nextMarketDay(maidu, pt('2026-10-25T12:00:00'))!.ymd).toBe('2026-10-25')
    expect(nextMarketDay(maidu, pt('2026-10-25T13:30:00'))!.ymd).toBe('2026-11-01')
  })
  it('keeps its wall-clock hours across the change from daylight time', () => {
    expect(nextMarketDay(maidu, pt('2026-10-26T12:00:00'))!.startsAt.toISOString()).toBe('2026-11-01T17:00:00.000Z')
  })
})

describe('attends', () => {
  it('every week unless skipping that date; listed dates only otherwise', () => {
    expect(attends({ every_week: true, dates: [], skip_dates: [] }, '2026-10-25')).toBe(true)
    expect(attends({ every_week: true, dates: [], skip_dates: ['2026-10-25'] }, '2026-10-25')).toBe(false)
    expect(attends({ every_week: false, dates: ['2026-11-01'], skip_dates: [] }, '2026-10-25')).toBe(false)
    expect(attends({ every_week: false, dates: ['2026-11-01'], skip_dates: [] }, '2026-11-01')).toBe(true)
  })
})

describe('wording', () => {
  const day = nextMarketDay(maidu, pt('2026-10-21T12:00:00'))!
  it('says the hours the short way', () => {
    expect(hoursLabel(day.startsAt, day.endsAt)).toBe('9–1')
    expect(hoursLabel(pt('2026-10-25T08:30:00'), pt('2026-10-25T12:00:00'))).toBe('8:30–12')
  })
  it('a vendor there every week: Find us Sundays 9–1 at the market', () => {
    expect(findUsLine({ every_week: true, dates: [], skip_dates: [] }, 'Maidu Park Farmers Market', maidu, pt('2026-10-21T12:00:00'))).toBe('Find us Sundays 9–1 at Maidu Park Farmers Market')
  })
  it('a vendor on listed dates: the next one', () => {
    expect(findUsLine({ every_week: false, dates: ['2026-10-18', '2026-11-08'], skip_dates: [] }, 'Maidu Park Farmers Market', maidu, pt('2026-10-21T12:00:00'))).toBe('Find us Sunday, Nov 8, 9–1 at Maidu Park Farmers Market')
  })
  it('a vendor with no date ahead says nothing', () => {
    expect(findUsLine({ every_week: false, dates: ['2026-10-18'], skip_dates: [] }, 'Maidu Park Farmers Market', maidu, pt('2026-10-21T12:00:00'))).toBeNull()
  })
  it('the reminder', () => {
    expect(stallReminderBody('Maidu Park Farmers Market', day.startsAt, day.endsAt)).toBe("They're at Maidu Park Farmers Market tomorrow, 9–1.")
  })
  it('the vendors line on a market reminder', () => {
    expect(vendorsLine([])).toBe('')
    expect(vendorsLine(['Ito Farms', 'Rise Bakery'])).toBe('Coming: Ito Farms, Rise Bakery.')
    expect(vendorsLine(['A', 'B', 'C', 'D', 'E'])).toBe('Coming: A, B, C and 2 more.')
  })
})
