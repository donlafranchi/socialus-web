import { describe, it, expect } from 'vitest'
import { shortDate } from '@/lib/knowledge/tools'

// #1284: a line's date drops the year when it is this year, so the moderation
// answer stays under its 2,000-token budget (F125.9) without dropping a ruling.
describe('a date as a line shows it', () => {
  it('drops this year, keeps any other, and leaves no date alone', () => {
    expect(shortDate('2026-10-11', 2026)).toBe('10-11')
    expect(shortDate('2025-12-30', 2026)).toBe('2025-12-30')
    expect(shortDate(null, 2026)).toBeNull()
  })
})
