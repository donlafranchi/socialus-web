import { describe, it, expect } from 'vitest'
import { isSampleBody, samplePosts, sampleWindow } from './samples'

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
  it('rolls forward from a later day', () => {
    const later = new Date('2026-10-20T18:00:00Z')
    expect(sampleWindow('event', later, subject.slug).startsAt.getTime()).toBeGreaterThan(later.getTime())
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

  // #816 a1 (cap-1, cap-5) — dates spread over the next 14 days, one on a weekend, and a deal that spans days.
  describe('a1 — when samples fall', () => {
    const wd = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(d)
    const slugs = Array.from({ length: 40 }, (_, i) => `page-${i}`)
    const days = (d: Date, from: Date) => (d.getTime() - from.getTime()) / 86_400_000
    it('every Page gets one sample on a Fri, Sat or Sun, within 14 days, in the future', () => {
      for (const now of [new Date('2026-10-16T18:00:00Z'), new Date('2026-10-18T23:00:00Z'), new Date('2026-10-20T15:00:00Z')]) {
        for (const slug of slugs) {
          const ev = sampleWindow('event', now, slug)
          expect(['Fri', 'Sat', 'Sun'], `${slug} ${now.toISOString()}`).toContain(wd(ev.startsAt))
          expect(ev.startsAt.getTime()).toBeGreaterThan(now.getTime())
          expect(days(ev.startsAt, now)).toBeLessThanOrEqual(14)
        }
      }
    })
    it('spreads Pages over the two weeks rather than piling them on one day', () => {
      const now = new Date('2026-10-16T18:00:00Z')
      const starts = new Set(slugs.map((s) => sampleWindow('event', now, s).startsAt.toISOString().slice(0, 10)))
      expect(starts.size).toBeGreaterThanOrEqual(4)
      const dealStarts = new Set(slugs.map((s) => sampleWindow('deal', now, s).startsAt.toISOString().slice(0, 10)))
      expect(dealStarts.size).toBeGreaterThanOrEqual(4)
    })
    it('a deal spans more than one day and ends within 14 days', () => {
      const now = new Date('2026-10-16T18:00:00Z')
      for (const slug of slugs) {
        const d = sampleWindow('deal', now, slug)
        expect(days(d.endsAt, d.startsAt)).toBeGreaterThan(1)
        expect(days(d.endsAt, now)).toBeLessThanOrEqual(14)
        expect(d.endsAt.getTime()).toBeGreaterThan(now.getTime())
      }
    })
  })
})

