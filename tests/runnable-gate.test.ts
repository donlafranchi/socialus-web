// T150 (Issue #31) — a test that cannot run fails the run.
//
// The defect: the storage suite carried the acceptance criterion "rejected by
// the storage API", was gated on a local Supabase instance, found none, and
// `describe.skipIf` skipped it. The run reported green and the ticket closed
// with the box ticked and nothing verified. The missing instance was the
// symptom; the harness reporting success for a test that did not exist at
// runtime was the defect.
//
// These tests cover the decision — which is pure — and then prove the
// consequence, because a guard against silently-passing checks that itself
// silently passes is the joke writing itself.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { decide } from './support/runnable'

const ROOT = path.resolve(__dirname, '..')

const CLAIM = 'the storage API rejects an upload that bypasses the client module'
const REMEDY = 'run `supabase start`, then set SUPABASE_URL and the keys'

describe('T150 — the runnable decision', () => {
  it('runs the suite when the environment is present', () => {
    expect(decide({ claim: CLAIM, available: true, remedy: REMEDY }, {})).toEqual({
      outcome: 'run',
    })
  })

  it('fails when the environment is absent and no escape hatch is set', () => {
    const d = decide({ claim: CLAIM, available: false, remedy: REMEDY }, {})
    expect(d.outcome).toBe('fail')
  })

  it('names the claim and the remedy in a message a non-engineer can read', () => {
    const d = decide({ claim: CLAIM, available: false, remedy: REMEDY }, {})
    if (d.outcome === 'run') throw new Error('expected a decision carrying a message')
    expect(d.message).toContain(CLAIM)
    expect(d.message).toContain(REMEDY)
    expect(d.message).toContain('ALLOW_UNVERIFIED')
  })

  it('downgrades to a warning when ALLOW_UNVERIFIED is set', () => {
    const d = decide({ claim: CLAIM, available: false, remedy: REMEDY }, { ALLOW_UNVERIFIED: '1' })
    expect(d.outcome).toBe('warn')
    if (d.outcome === 'run') throw new Error('expected a decision carrying a message')
    expect(d.message).toContain(CLAIM)
  })

  it('ignores an empty ALLOW_UNVERIFIED rather than treating it as set', () => {
    // `ALLOW_UNVERIFIED=` in a shell exports an empty string. Reading that as
    // "on" would turn the escape hatch into the default.
    const d = decide({ claim: CLAIM, available: false, remedy: REMEDY }, { ALLOW_UNVERIFIED: '' })
    expect(d.outcome).toBe('fail')
  })

  it('never downgrades a suite that can actually run', () => {
    expect(
      decide({ claim: CLAIM, available: true, remedy: REMEDY }, { ALLOW_UNVERIFIED: '1' }),
    ).toEqual({ outcome: 'run' })
  })
})

/**
 * Run the fixture suite — which is always unrunnable — with a given env.
 *
 * Both streams are captured: the failure lands on stdout via the reporter,
 * while the UNVERIFIED block is a raw stderr write (Vitest swallows console
 * output but passes process.stderr through).
 */
function runFixture(env: Record<string, string>): { status: number; output: string } {
  const r = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'tests/fixtures/vitest.fixture.config.ts'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } },
  )
  return { status: r.status ?? 1, output: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('T150 — the consequence, proven', () => {
  it('a suite that cannot run makes the run exit non-zero', () => {
    const { status, output } = runFixture({ ALLOW_UNVERIFIED: '' })
    expect(status).not.toBe(0)
    expect(output).toContain('a deliberately absent environment')
  }, 120_000)

  it('ALLOW_UNVERIFIED=1 makes the same run pass, and says what went unchecked', () => {
    const { status, output } = runFixture({ ALLOW_UNVERIFIED: '1' })
    expect(status).toBe(0)
    expect(output).toContain('UNVERIFIED')
    expect(output).toContain('a deliberately absent environment')
  }, 120_000)
})
