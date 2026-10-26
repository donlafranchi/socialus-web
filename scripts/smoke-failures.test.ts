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
  it('reads a failure block that Playwright prints on a progress line (#888)', () => {
    const esc = '\x1b[1A\x1b[2K'
    const l = [
      `${esc}[43/70] [smoke-live] › evals/smoke/live.spec.ts:81:11 › ownerBusiness › page`,
      `${esc}  1) [smoke-live] › evals/smoke/live.spec.ts:81:11 › ownerBusiness › page ──────`,
      '',
      '    \x1b[31m+   "uncaught error: Lock broken by another request with the \'steal\' option.",\x1b[39m',
    ].join('\n')
    expect(smokeFailures(l)).toBe("ownerBusiness › page: uncaught error: Lock broken by another request with the 'steal' option.\",")
  })
})
