// #443 — the public Issue a member's report becomes. The full report lives in a
// private table; the Issue must never carry member data (research note 2026-10-06
// § 2 step 3). This is the scrub, and it has its own test.

import { describe, it, expect } from 'vitest'
import { publicIssue, browserFamily, type ProblemReportRow } from './public-issue'

const report: ProblemReportRow = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  createdAt: new Date('2026-10-07T20:00:00Z'),
  memberId: 'f6e5d4c3-0000-4000-8000-000000000009',
  role: 'member',
  route: '/g/abc123?tab=posts&email=maya@example.com',
  buildSha: '0b26c0d9f1e2a3b4c5d6e7f8091a2b3c4d5e6f70',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  description: 'The Save button did nothing. Call me at (916) 555-0134 or maya@example.com. My zip is 95819.',
}

describe('browserFamily', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', 'Chrome on macOS'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox on Windows'],
    ['', 'unknown browser'],
  ])('reduces %s to a family, never the full string', (ua, family) => {
    expect(browserFamily(ua)).toBe(family)
  })
})

describe('publicIssue', () => {
  const issue = publicIssue(report)

  it('carries the lines issue-lint needs, and says it came from a member report', () => {
    expect(issue.body).toMatch(/\*\*Kind:\*\* bug/)
    expect(issue.body).toMatch(/\*\*Scenario:\*\* none/)
    expect(issue.body).toMatch(/\*\*Path:\*\* well-worn/)
    expect(issue.title).toMatch(/^bug · /)
  })

  it('names the route without its query string, the role (not who), a short build, and the browser family', () => {
    expect(issue.body).toContain('/g/abc123')
    expect(issue.body).not.toContain('tab=posts')
    expect(issue.body).toMatch(/role: member/i)
    expect(issue.body).toContain('0b26c0d')
    expect(issue.body).not.toContain(report.buildSha)
    expect(issue.body).toContain('Safari on iOS')
  })

  it('links back to the private row by its id, and nothing else about the member', () => {
    expect(issue.body).toContain(report.id)
    expect(issue.body).not.toContain(report.memberId!)
  })

  it('leaves no email, phone, zip or user-agent string anywhere in the title or body', () => {
    const text = `${issue.title}\n${issue.body}`
    expect(text).not.toMatch(/maya@example\.com|555-0134|95819|iPhone OS|AppleWebKit/)
  })

  it('keeps a short scrubbed excerpt of what was said, so it can be triaged', () => {
    expect(issue.body).toContain('The Save button did nothing.')
    expect(issue.body).toContain('[email]')
    expect(issue.body).toContain('[phone]')
  })

  it('caps the excerpt, and the title is one short line', () => {
    const long = publicIssue({ ...report, description: 'x'.repeat(5000) })
    expect(long.body.length).toBeLessThan(1500)
    expect(long.title.length).toBeLessThanOrEqual(100)
    expect(long.title).not.toContain('\n')
  })

  it('a signed-out or unknown role is just a role', () => {
    expect(publicIssue({ ...report, role: 'signed-out', memberId: null }).body).toMatch(/role: signed-out/i)
  })

  it('starts untriaged: labelled for the triage agent, with no area or milestone guessed', () => {
    expect(issue.labels).toEqual(['bug', 'member-report', 'needs-triage'])
  })
})
