// #1433 — the weekly retro's digest: the facts a script can count, for the agent pass that judges them.
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isCodePR, measure, scoresStale, render, BASELINE, closesIssue, costOf, median } = require('../scripts/retro-digest.cjs')

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

  // #1520: the upkeep list, folded in from the retired monthly Issue (F128.7).
  describe('upkeep (#1520)', () => {
    const base = { from: '2026-11-30', to: '2026-12-07', prs: [], alarms: [], scoresLast: '2026-12-06', now: new Date('2026-12-07'), measureStart: '2026-11-27' }
    it('lists each rule or experiment due, and tells the agent pass to act on them', () => {
      const md = render({ ...base, upkeep: [
        { id: 'practice.x', kind: 'practice', answer: 'Do x.', problem: 'not confirmed since 2026-08-01' },
        { id: 'EX-0001', kind: 'experiment', answer: 'Measure cost.', problem: 'verdict was due 2026-12-28 and is still running' },
      ] })
      expect(md).toMatch(/Upkeep: 2 due/)
      expect(md).toMatch(/- practice\.x \(practice\): not confirmed since 2026-08-01\. Do x\./)
      expect(md).toMatch(/- EX-0001 \(experiment\): verdict was due/)
      expect(md).toMatch(/reconfirm each rule listed/)
    })
    it('says nothing is due when nothing is, and says so when the store could not be read', () => {
      expect(render({ ...base, upkeep: [] })).toMatch(/Upkeep: nothing due/)
      expect(render({ ...base, upkeep: [] })).not.toMatch(/reconfirm each rule/)
      expect(render({ ...base, upkeep: null })).toMatch(/Upkeep: not read this week/)
    })
  })

  // #1520: EX-0001, what each merged change cost.
  describe('cost per change (#1520, EX-0001)', () => {
    const run = (sha: string, start: string, end: string) => ({ head_sha: sha, run_started_at: start, updated_at: end })
    it('counts pushes as distinct head commits, CI minutes as run time, and days from the Issue it closes', () => {
      const c = costOf({
        number: 7,
        runs: [run('a', '2026-12-01T10:00:00Z', '2026-12-01T10:06:00Z'), run('a', '2026-12-01T10:00:00Z', '2026-12-01T10:01:00Z'), run('b', '2026-12-01T12:00:00Z', '2026-12-01T12:03:00Z')],
        mergedAt: '2026-12-02T12:00:00Z', issueCreatedAt: '2026-12-01T00:00:00Z',
      })
      expect(c).toEqual({ number: 7, pushes: 2, ciMinutes: 10, issueToMergeDays: 1.5 })
      expect(costOf({ number: 8, runs: [], mergedAt: '2026-12-02T00:00:00Z' }).issueToMergeDays).toBeNull()
    })
    it('finds the Issue a PR closes only from a closing keyword', () => {
      expect(closesIssue('text\n\nCloses #1476')).toBe(1476)
      expect(closesIssue('Fixes: #12')).toBe(12)
      expect(closesIssue('see #5, after #6')).toBeNull()
      expect(closesIssue(null)).toBeNull()
    })
    it('takes medians over the numbers it has, skipping a PR with no Issue', () => {
      expect(median([3, 1, 2])).toBe(2)
      expect(median([1, null, 4])).toBe(2.5)
      expect(median([null])).toBeNull()
    })
    it('renders a row per code PR with the week\'s medians, and says when it could not be read', () => {
      const now = new Date('2026-12-07')
      const md = render({ from: '2026-11-30', to: '2026-12-07', prs: [], alarms: [], scoresLast: null, now, measureStart: '2026-11-27',
        costs: [{ number: 7, pushes: 2, ciMinutes: 10, issueToMergeDays: 1.5 }, { number: 9, pushes: 4, ciMinutes: 20, issueToMergeDays: null }] })
      expect(md).toMatch(/What each change cost \(EX-0001, 2026-11-30 to 2026-12-28\)/)
      expect(md).toMatch(/Medians:\*\* 3 pushes, 15 CI minutes, 1\.5 days/)
      expect(md).toContain('| #7 | 2 | 10 | 1.5 |')
      expect(md).toContain('| #9 | 4 | 20 | — |')
      expect(render({ from: '2026-11-30', to: '2026-12-07', prs: [], alarms: [], scoresLast: null, now, measureStart: '2026-11-27', costs: null })).toMatch(/cost: not read this week/)
    })
    it('leaves both sections out when not passed', () => {
      const md = render({ from: '2026-11-30', to: '2026-12-07', prs: [], alarms: [], scoresLast: null, now: new Date('2026-12-07'), measureStart: '2026-11-27' })
      expect(md).not.toMatch(/Upkeep|What each change cost/)
    })
  })
})
