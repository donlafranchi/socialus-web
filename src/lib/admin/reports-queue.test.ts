import { describe, it, expect } from 'vitest'
import { hiddenFor } from './reports-queue'

// The queue is ordered by how long content has been withheld, so this string is
// the thing the operator triages on. It is worth being exactly right.
describe('hiddenFor', () => {
  const now = new Date('2026-09-17T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('says nothing when nothing is hidden', () => {
    expect(hiddenFor(null, now)).toBeNull()
  })

  it('counts minutes, then hours, then days', () => {
    expect(hiddenFor(ago(12 * 60_000), now)).toBe('12 minutes')
    expect(hiddenFor(ago(4 * 3_600_000), now)).toBe('4 hours')
    expect(hiddenFor(ago(3 * 86_400_000), now)).toBe('3 days')
  })

  it('is singular at one', () => {
    expect(hiddenFor(ago(60_000), now)).toBe('1 minute')
    expect(hiddenFor(ago(3_600_000), now)).toBe('1 hour')
    expect(hiddenFor(ago(86_400_000), now)).toBe('1 day')
  })

  it('never reads as negative when clocks disagree', () => {
    expect(hiddenFor(new Date(now.getTime() + 60_000), now)).toBe('0 minutes')
  })
})
