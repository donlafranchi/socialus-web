import { describe, it, expect } from 'vitest'
import { parseReach, REACH_CAP } from './reach'

describe('#922 — Explore’s reach', () => {
  it('reads a ring or the whole area from a link, and nothing else', () => {
    expect(parseReach('30')).toBe(30)
    expect(parseReach('all')).toBe('all')
    expect(parseReach('20')).toBeNull()
    expect(parseReach('')).toBeNull()
    expect(parseReach(null)).toBeNull()
  })

  it('caps the rings at an hour', () => {
    expect(REACH_CAP).toBe(60)
  })
})
