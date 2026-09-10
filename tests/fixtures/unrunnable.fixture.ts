// T150 — the fixture behind "prove the check can fail".
//
// Always unrunnable, by construction. tests/runnable-gate.test.ts spawns this
// under both env settings and asserts the run goes red without the escape
// hatch and green with it. Excluded from the normal suite by its filename;
// it is collected only through vitest.fixture.config.ts.

import { describe, it, expect } from 'vitest'
import { requireRunnable } from '../support/runnable'

const runnable = requireRunnable({
  claim: 'a deliberately absent environment can be reached',
  available: false,
  remedy: 'nothing — this fixture exists to be unrunnable',
})

describe.skipIf(!runnable)('a suite that never runs', () => {
  it('would have checked something', () => {
    expect(true).toBe(true)
  })
})
