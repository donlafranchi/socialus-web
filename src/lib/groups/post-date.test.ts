import { describe, it, expect } from 'vitest'
import { formatPostDate } from './post-date'

describe('formatPostDate', () => {
  const now = new Date('2026-09-15T12:00:00Z')

  it('leaves the year off a post from this year', () => {
    expect(formatPostDate('2026-09-15T10:00:00Z', now)).toBe('September 15')
  })

  it('names the year on an older post', () => {
    expect(formatPostDate('2025-03-02T10:00:00Z', now)).toBe('March 2, 2025')
  })

  it('reads the same whatever zone the reader is in', () => {
    // Fixed to UTC on purpose: a server and a browser that disagree here
    // produce a hydration mismatch on every Page that has a post.
    expect(formatPostDate('2026-09-15T23:30:00Z', now)).toBe('September 15')
  })

  it('renders nothing for an unreadable date rather than "Invalid Date"', () => {
    expect(formatPostDate('not a date', now)).toBe('')
  })
})
