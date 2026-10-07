// chore #432 — the live smoke's shape: nightly before the 5am handoff, its
// self-test before the smoke, read-only, and a bug filed on failure.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const wf = readFileSync('.github/workflows/smoke-live.yml', 'utf8').replace(/^\s*#.*$/gm, '')
const spec = readFileSync('evals/smoke/live.spec.ts', 'utf8')

describe('smoke-live.yml', () => {
  it('runs overnight, finishing before 12:00 UTC (5am PDT)', () => {
    const m = wf.match(/cron: '(\d+) (\d+) \* \* \*'/)
    expect(m).not.toBeNull()
    expect(Number(m![2])).toBeLessThan(12)
  })
  it('proves the smoke can fail before running it', () => {
    expect(wf.indexOf('--project=smoke-guard')).toBeGreaterThan(-1)
    expect(wf.indexOf('--project=smoke-guard')).toBeLessThan(wf.indexOf('--project=smoke-live'))
  })
  it('opens a bug on failure', () => {
    expect(wf).toContain("title = 'bug · live:")
    expect(wf).toContain('launch-blocking')
  })
  it('only reads: the spec never posts or submits anything', () => {
    expect(spec).not.toMatch(/method: '(POST|PUT|PATCH|DELETE)'|\.request\.(post|put|patch|delete)/i)
    expect(spec).not.toMatch(/name: \/(publish|create|delete|save)/i)
    expect(spec).toContain('READ-ONLY')
  })
})
