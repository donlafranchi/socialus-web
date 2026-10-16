import { describe, it, expect } from 'vitest'
import { fitsSchedule, isSampleBody, rollSample, samplePosts, sampleSchedule } from './samples'

const subject = { name: 'Temple Coffee Roasters', slug: 'temple-abc123', pool: 'Food & drink', area: 'Midtown' }
const now = new Date('2026-10-10T18:00:00Z')

describe('samplePosts (#556)', () => {
  const posts = samplePosts(subject, now)
  it('is an event, a deal and a last-minute opening', () => {
    expect(posts.map((p) => p.kind)).toEqual(['event', 'deal', 'last_minute'])
  })
  it('opens every one with the Sample label, and says it is not a real offer', () => {
    for (const p of posts) {
      expect(isSampleBody(p.body)).toBe(true)
      expect(p.body).toMatch(/not a real offer/)
      expect(p.body).toContain('Temple Coffee Roasters')
    }
  })
  it('keeps to the column limits and carries no email', () => {
    for (const p of posts) {
      expect(p.body.length).toBeLessThanOrEqual(5000)
      expect(p.howToFind.length).toBeLessThanOrEqual(140)
      expect(p.body).not.toMatch(/@/)
      expect(p.endsAt.getTime()).toBeGreaterThan(p.startsAt.getTime())
    }
  })
  it('lands in the future, so Explore shows them as coming up', () => {
    for (const p of posts) expect(p.endsAt.getTime()).toBeGreaterThan(now.getTime())
    expect(posts[0]!.startsAt.getTime()).toBeGreaterThan(now.getTime())
  })
  it('does not read the same on every Page', () => {
    const bodies = new Set(Array.from({ length: 12 }, (_, i) => samplePosts({ ...subject, slug: `s-${i}` }, now)[0]!.body))
    expect(bodies.size).toBeGreaterThan(1)
  })
  it('asks a volunteer group for help instead of offering a discount (#786)', () => {
    for (let i = 0; i < 8; i++) {
      for (const p of samplePosts({ ...subject, name: 'Yolo Food Bank', slug: `fb-${i}`, pool: 'Community & volunteer' }, now)) {
        expect(isSampleBody(p.body)).toBe(true)
        expect(p.body).not.toMatch(/% off|price|deal|buy /i)
        expect(p.body).toContain('Yolo Food Bank')
      }
    }
  })
  it('an arts group gets the same invite-to-help posts, never a discount (#786)', () => {
    for (const p of samplePosts({ ...subject, name: 'Rocklin Historical Society', slug: 'rhs-1', pool: 'Arts & culture' }, now)) {
      expect(p.body).not.toMatch(/% off|price|deal|buy /i)
    }
  })

  // Don, 2026-10-16 (cap-1, cap-5): a "regular weekly" look — each Page's three samples on one weekday, weeks 1–3.
  describe('weekly — when samples fall', () => {
    const tz = 'America/Los_Angeles'
    const wd = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
    const hm = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
    const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 86_400_000
    const pools = ['Farm', 'Food & drink', 'Goods & crafts', 'Repair & trades', 'Community & volunteer', 'Farm stay & agritourism', 'Shop']
    const pages = Array.from({ length: 70 }, (_, i) => ({ slug: `page-${i}`, pool: pools[i % pools.length]! }))
    const nows = [new Date('2026-10-16T18:00:00Z'), new Date('2026-10-18T23:00:00Z'), new Date('2026-11-02T15:00:00Z')]

    it('puts a Page\'s three samples on the same weekday in weeks 1, 2 and 3, all ahead', () => {
      for (const now of nows) {
        for (const p of pages) {
          const starts = Object.values(sampleSchedule(now, p.slug, p.pool)).map((w) => w.startsAt).sort((a, b) => a.getTime() - b.getTime())
          expect(new Set(starts.map(wd)).size, p.slug).toBe(1)
          expect(starts[0]!.getTime()).toBeGreaterThan(now.getTime())
          expect(days(starts[0]!, now)).toBeLessThan(8)
          expect(Math.round(days(starts[1]!, starts[0]!))).toBe(7)
          expect(Math.round(days(starts[2]!, starts[1]!))).toBe(7)
        }
      }
    })
    it('covers every day of the week, with more on Fri–Sun', () => {
      const count: Record<string, number> = {}
      for (const p of pages) { const d = wd(sampleSchedule(nows[0]!, p.slug, p.pool).event.startsAt); count[d] = (count[d] ?? 0) + 1 }
      expect(Object.keys(count).sort()).toEqual(['Fri', 'Mon', 'Sat', 'Sun', 'Thu', 'Tue', 'Wed'])
      const weekend = (count.Fri! + count.Sat! + count.Sun!) / 3
      const weekday = (count.Mon! + count.Tue! + count.Wed! + count.Thu!) / 4
      expect(weekend).toBeGreaterThan(weekday)
    })
    it('varies which kind comes first, and the times', () => {
      const first = new Set(pages.map((p) => { const s = sampleSchedule(nows[0]!, p.slug, p.pool); return (Object.keys(s) as (keyof typeof s)[]).sort((a, b) => s[a].startsAt.getTime() - s[b].startsAt.getTime())[0] }))
      expect(first.size).toBe(3)
      expect(new Set(pages.map((p) => hm(sampleSchedule(nows[0]!, p.slug, p.pool).event.startsAt))).size).toBeGreaterThanOrEqual(4)
      const farm = pages.filter((p) => p.pool === 'Farm').map((p) => hm(sampleSchedule(nows[0]!, p.slug, p.pool).event.startsAt))
      for (const t of farm) expect(t < '12:00').toBe(true)
    })
    it('a deal spans 2–3 days within its week; the others are a few hours', () => {
      for (const p of pages) {
        const s = sampleSchedule(nows[0]!, p.slug, p.pool)
        expect(days(s.deal.endsAt, s.deal.startsAt)).toBeGreaterThan(1)
        expect(days(s.deal.endsAt, s.deal.startsAt)).toBeLessThan(3)
        expect(days(s.event.endsAt, s.event.startsAt)).toBeLessThan(1)
        expect(days(s.last_minute.endsAt, s.last_minute.startsAt)).toBeLessThan(1)
      }
    })
    it('rolls a finished sample three weeks on, same weekday and time, and leaves a current one alone', () => {
      const s = sampleSchedule(nows[0]!, 'page-3', 'Farm')
      const later = new Date(s.event.endsAt.getTime() + 3600_000)
      const rolled = rollSample(s.event, later)!
      expect(Math.round(days(rolled.startsAt, s.event.startsAt))).toBe(21)
      expect(wd(rolled.startsAt)).toBe(wd(s.event.startsAt))
      expect(hm(rolled.startsAt)).toBe(hm(s.event.startsAt))
      expect(rollSample(s.event, nows[0]!)).toBeNull()
      expect(rollSample(s.event, new Date(later.getTime() + 50 * 86_400_000))!.endsAt.getTime()).toBeGreaterThan(later.getTime() + 50 * 86_400_000)
      expect(fitsSchedule('event', rolled, 'page-3', 'Farm')).toBe(true)
    })
    it('a sample dated by the old 14-day rule does not fit, so the refresh re-dates it', () => {
      const s = sampleSchedule(nows[0]!, 'page-3', 'Farm')
      const off = { startsAt: new Date(s.event.startsAt.getTime() + 86_400_000), endsAt: new Date(s.event.endsAt.getTime() + 86_400_000) }
      expect(fitsSchedule('event', s.event, 'page-3', 'Farm')).toBe(true)
      expect(fitsSchedule('event', off, 'page-3', 'Farm')).toBe(false)
    })
  })
})
