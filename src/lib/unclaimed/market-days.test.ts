import { describe, it, expect } from 'vitest'
import { marketDayBody, marketDays, type MarketSchedule } from './market-days'

const maidu: MarketSchedule = { weekday: 7, start: '09:00', end: '13:00', hours: 'Sundays 9 AM–1 PM, year-round', source: 'https://www.bemoneysmartusa.org/copy-of-mahany-park-roseville' }
const pt = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)

describe('marketDays (Maidu Park, Don 2026-10-19)', () => {
  it('is the next three market days, on its weekday at its own hours', () => {
    const days = marketDays(maidu, new Date('2026-10-19T19:00:00Z'))
    expect(days.map((d) => pt(d.startsAt))).toEqual(['Sun, 10/25, 9:00 AM', 'Sun, 11/1, 9:00 AM', 'Sun, 11/8, 9:00 AM'])
    expect(days.map((d) => pt(d.endsAt))).toEqual(['Sun, 10/25, 1:00 PM', 'Sun, 11/1, 1:00 PM', 'Sun, 11/8, 1:00 PM'])
  })
  it('keeps today while the market is still on, and drops it once it ends', () => {
    expect(pt(marketDays(maidu, new Date('2026-10-25T18:00:00Z'))[0]!.startsAt)).toBe('Sun, 10/25, 9:00 AM')
    expect(pt(marketDays(maidu, new Date('2026-10-25T20:30:00Z'))[0]!.startsAt)).toBe('Sun, 11/1, 9:00 AM')
  })
})

describe('marketDayBody', () => {
  it('says when, is not a Sample, and credits where the hours came from', () => {
    const b = marketDayBody('Maidu Park Farmers Market', maidu)
    expect(b.startsWith('Sample')).toBe(false)
    expect(b).toContain('Market day')
    expect(b).toContain('Sundays 9 AM–1 PM, year-round')
    expect(b).toContain(maidu.source)
    expect(b.length).toBeLessThanOrEqual(500)
  })
})
