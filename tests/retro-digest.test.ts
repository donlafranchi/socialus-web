// #1433 — the weekly retro's digest: the facts a script can count, for the agent pass that judges them.
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isCodePR, measure, scoresStale, render, BASELINE } = require('../scripts/retro-digest.cjs')

const pr = (n: number, files: string[], reviewed: boolean, mergedAt = '2026-12-01T00:00:00Z') => ({ number: n, title: `t${n}`, files, reviewed, mergedAt })

describe('retro digest', () => {
  it('a code PR touches something other than docs', () => {
    expect(isCodePR(['src/a.ts', 'README.md'])).toBe(true)
    expect(isCodePR(['tests/a.test.ts'])).toBe(true)
    expect(isCodePR(['docs/x.md', 'build-log/r.json', 'INFRASTRUCTURE.md'])).toBe(false)
  })

  it('measures the next 30 reviewed code PRs from the start date, oldest first', () => {
    const prs = [pr(3, ['src/a.ts'], true, '2026-11-28T00:00:00Z'), pr(1, ['src/a.ts'], true, '2026-11-20T00:00:00Z'), pr(2, ['docs/a.md'], true, '2026-11-29T00:00:00Z'), pr(4, ['src/b.ts'], false, '2026-11-29T00:00:00Z')]
    expect(measure(prs, '2026-11-27')).toEqual({ counted: [3], of: 30, done: false })
  })

  it('scores are stale after 7 days without a row', () => {
    expect(scoresStale('2026-11-06', new Date('2026-11-30'))).toBe(true)
    expect(scoresStale('2026-11-28', new Date('2026-11-30'))).toBe(false)
  })

  it('renders what repeated, what was skipped, and at most one check', () => {
    const md = render({
      from: '2026-11-23', to: '2026-11-30',
      prs: [pr(10, ['src/a.ts'], true), pr(11, ['src/b.ts'], false), pr(12, ['docs/a.md'], false)],
      alarms: [{ number: 20, title: 'bug · socialus.org is down', state: 'closed', needsReview: true }],
      scoresLast: '2026-11-06', now: new Date('2026-11-30'), measureStart: '2026-11-27',
    })
    expect(md).toContain('#10')
    expect(md).toMatch(/No review[^\n]*#11/)
    expect(md).not.toMatch(/#12\b/)
    expect(md).toMatch(/#20[^\n]*needs-review/)
    expect(md).toMatch(/Scores[^\n]*2026-11-06[^\n]*stale/i)
    expect(md).toMatch(/at most one/i)
    expect(md).toMatch(/PR-0003[^\n]*three or more PRs[^\n]*judgement-only/)
    for (const c of BASELINE.classes) expect(md).toContain(c.name)
  })
  it('counts the measure across weeks when given every PR since the start', () => {
    const older = pr(5, ['src/a.ts'], true, '2026-11-28T00:00:00Z')
    const md = render({ from: '2026-12-07', to: '2026-12-14', prs: [], measurePrs: [older], alarms: [], scoresLast: null, now: new Date('2026-12-14'), measureStart: '2026-11-27' })
    expect(md).toMatch(/Measured \(#1433\): 1 of 30/)
  })
})
