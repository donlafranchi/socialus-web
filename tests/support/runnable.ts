// T150 (Issue #31) — one helper, one message, one escape hatch.
//
// A test skipped because a feature is deliberately out of scope is fine. A
// test skipped because the environment could not run it is an unmet acceptance
// criterion wearing a passing badge, and that is what this converts into a
// failure.
//
// Deliberately not clever: no severity matrix, no per-suite configuration. A
// configurable severity is how the next person turns this off.

import { it } from 'vitest'

export interface Requirement {
  /** What this suite verifies — one sentence, readable by a non-engineer. */
  claim: string
  /** Whether the environment can actually run it. */
  available: boolean
  /** What would make it runnable. */
  remedy: string
}

export type Outcome =
  | { outcome: 'run' }
  | { outcome: 'fail'; message: string }
  | { outcome: 'warn'; message: string }

/**
 * The whole decision, as a pure function of the requirement and the
 * environment, so it can be tested without an environment.
 */
export function decide(req: Requirement, env: Record<string, string | undefined>): Outcome {
  if (req.available) return { outcome: 'run' }

  const message =
    `This check did not run, so nothing verified it: ${req.claim}.\n` +
    `To run it: ${req.remedy}.\n` +
    `To accept it unverified for a local iteration loop, set ALLOW_UNVERIFIED=1. ` +
    `Never in a merge or a close-out — the run will list what went unchecked.`

  // An empty string is what `ALLOW_UNVERIFIED=` exports; reading that as "on"
  // would make the escape hatch the default.
  return env.ALLOW_UNVERIFIED ? { outcome: 'warn', message } : { outcome: 'fail', message }
}

/**
 * Print the warning where a person will see it.
 *
 * Two constraints shape this. Vitest runs each test file in its own worker and
 * drops writes that arrive after the run finishes, so a process-exit hook
 * prints nothing — this goes out during collection instead, beside the file it
 * belongs to. And Vitest swallows `console.warn` while passing
 * `process.stderr` straight through, so the raw write is the one that reaches
 * a person. Both verified against this repo's Vitest, not assumed.
 */
function warnUnverified(claim: string, message: string): void {
  process.stderr.write(
    `\nUNVERIFIED — nothing in this run checked: ${claim}\n` +
      `${message}\n` +
      `ALLOW_UNVERIFIED downgraded this from a failure. Do not close work on this run.\n`,
  )
}

/**
 * Call at the top level of a test file, beside the `describe.skipIf` that
 * gates the suite. When the environment is missing this registers a failing
 * test, so the run goes red rather than reporting green on a suite that never
 * existed at runtime.
 */
export function requireRunnable(req: Requirement, env = process.env): boolean {
  const d = decide(req, env)
  if (d.outcome === 'run') return true

  if (d.outcome === 'warn') {
    warnUnverified(req.claim, d.message)
    // Marked skipped, not passed: under the escape hatch nothing ran, and a
    // green tick for a suite that did not execute is the defect this file
    // exists to remove.
    it.skip(`UNVERIFIED: ${req.claim}`, () => {})
    return false
  }

  it(`cannot run: ${req.claim}`, () => {
    throw new Error(d.message)
  })
  return false
}
