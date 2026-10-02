// chore #291 — "Migrations applied to production" runs on pushes to main as
// well as on pull requests, so main itself goes red when production is behind.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ci = readFileSync('.github/workflows/ci.yml', 'utf8').replace(/^\s*#.*$/gm, '')
const job = ci.slice(ci.indexOf('\n  applied:'), ci.indexOf('\n    steps:', ci.indexOf('\n  applied:')))

describe('the migrations-applied check', () => {
  it('runs on pushes to main, not only on pull requests', () => {
    expect(job).toContain('name: Migrations applied to production')
    expect(job).toContain("github.event_name == 'pull_request'")
    expect(job).toMatch(/github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/)
  })
})
