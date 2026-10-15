import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { smokeFailures } = require('./smoke-failures.cjs') as { smokeFailures: (log: string) => string }

describe('the live smoke files only what failed (#790)', () => {
  const log = readFileSync(join(__dirname, '../tests/fixtures/smoke-live-failed.log'), 'utf8')
  it('names the failed test and its reason, not the progress lines', () => {
    const out = smokeFailures(log)
    expect(out).toContain('member › explore-map')
    expect(out).toContain('Failed to fetch')
    expect(out).not.toMatch(/\[\d+\/\d+\]/)
    expect(out).not.toContain('member › you-settings-tab')
  })
  it('ignores the must-fail self-test', () => {
    expect(smokeFailures(log)).not.toContain('must-fail')
  })
})
