import { describe, it, expect } from 'vitest'
import { sortSaved, type SavedPost } from './saved-posts'

// #1171 (plan #269, Don 2026-11-02) — the Saved list on You: upcoming first, soonest first; then undated, newest saved
// first; past ones drop to the end, most recent first.
const NOW = new Date('2026-11-02T12:00:00Z')
const s = (id: string, startsAt: string | null, savedAt: string, endsAt: string | null = null) =>
  ({ postId: id, startsAt, endsAt, savedAt }) as SavedPost

describe('the Saved list order', () => {
  it('upcoming soonest first, then undated newest saved first, then past most recent first', () => {
    const rows = [
      s('past-old', '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z'),
      s('undated-old', null, '2026-10-01T00:00:00Z'),
      s('later', '2026-11-20T00:00:00Z', '2026-10-01T00:00:00Z'),
      s('past-new', '2026-10-30T00:00:00Z', '2026-09-01T00:00:00Z'),
      s('soon', '2026-11-03T00:00:00Z', '2026-10-01T00:00:00Z'),
      s('undated-new', null, '2026-11-01T00:00:00Z'),
    ]
    expect(sortSaved(rows, NOW).map((r) => r.postId)).toEqual(['soon', 'later', 'undated-new', 'undated-old', 'past-new', 'past-old'])
  })

  it('a post still on (started, not ended) counts as upcoming', () => {
    const rows = [s('on-now', '2026-11-02T10:00:00Z', '2026-10-01T00:00:00Z', '2026-11-02T18:00:00Z'), s('undated', null, '2026-11-01T00:00:00Z')]
    expect(sortSaved(rows, NOW).map((r) => r.postId)).toEqual(['on-now', 'undated'])
    expect(sortSaved(rows, NOW)[0]!.past).toBe(false)
  })
})
