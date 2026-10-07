// chore #427 — the Browser job runs on every ready PR that touches src/ or
// supabase/, not only on PRs labelled for review. socialus-web is public, so
// the minutes are free; the browser suite should guard what it can see.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/^\s*#.*$/gm, '')
const at = ci.indexOf('\n  browser:')
const job = ci.slice(at, ci.indexOf('\n    runs-on:', at))
const changes = ci.slice(ci.indexOf('\n  changes:'), at)

describe('the browser job', () => {
  it('does not wait for a review label', () => {
    expect(job).not.toMatch(/human-review|needs-don/)
  })
  it('runs when the PR touches src/ or supabase/, decided by the changes job', () => {
    expect(job).toMatch(/needs:\s*changes/)
    expect(job).toContain("needs.changes.outputs.runtime == 'true'")
    expect(changes).toMatch(/\(src\|supabase\)/)
  })
  it('still runs on main, schedule and dispatch without a PR', () => {
    expect(job).toContain("github.event_name != 'pull_request'")
  })
})
