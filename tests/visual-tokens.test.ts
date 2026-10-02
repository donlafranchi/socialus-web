// #295 — no screen uses a one-off visual value outside the token file, beyond
// the shrinking baseline. See src/lib/design/visual-tokens-check.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkVisualTokens, type Baseline } from '../src/lib/design/visual-tokens-check'
import { BASELINE_PATH, screenFiles } from '../scripts/visual-tokens'

describe('#295 — visual values come from the tokens', () => {
  it('no screen adds a one-off, and the baseline lists nothing the tree no longer has', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
    const violations = checkVisualTokens(screenFiles(), baseline)
    expect(violations.map((v) => `${v.kind}: ${v.file} ${v.value}`)).toEqual([])
  })
})
