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
})
