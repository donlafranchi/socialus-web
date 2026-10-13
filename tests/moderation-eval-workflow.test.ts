// #638 (F100.9) — the evaluation harness runs on every prompt change: a workflow filtered to the files that make up
// the prompt, the models and the labelled set. It always validates the set (no key, no cost); the full run needs the
// Anthropic key as a repo secret and says plainly when it is skipped.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WF = readFileSync(resolve(__dirname, '../.github/workflows/moderation-eval.yml'), 'utf8')
const PROMPT_FILES = ['src/lib/moderation/rules.ts', 'src/lib/moderation/assess.ts', 'src/lib/moderation/eval-metrics.ts', 'evals/moderation/**', 'scripts/moderation-eval.ts']

describe('the moderation eval workflow', () => {
  // [guards F100.9 partial: it runs when the prompt, the models or the labelled set change]
  it.each(PROMPT_FILES)('runs when %s changes, on a pull request and on main', (path) => {
    const blocks = WF.split(/^  (?=pull_request:|push:)/m).slice(1)
    expect(blocks).toHaveLength(2)
    for (const b of blocks) expect(b).toContain(`- '${path}'`)
  })

  it('does not run on every change: there is a paths filter on both triggers', () => {
    expect((WF.match(/^\s+paths:/gm) ?? []).length).toBe(2)
  })

  // [guards F100.9 partial: it always validates the set, with no key and no cost]
  it('always validates the labelled set with --check', () => {
    expect(WF).toMatch(/npm run moderation:eval -- --check/)
  })

  // [guards F100.9 partial: the full run happens only with the key, and the skip is visible]
  it('runs the full harness only when the key secret exists, and says when it is skipped', () => {
    expect(WF).toMatch(/ANTHROPIC_MODERATION_KEY: \$\{\{ secrets\.ANTHROPIC_MODERATION_KEY \}\}/)
    expect(WF).toMatch(/-z "\$ANTHROPIC_MODERATION_KEY"/)
    expect(WF).toMatch(/GITHUB_STEP_SUMMARY/)
    expect(WF).toMatch(/skipped/i)
    expect(WF).toMatch(/npm run moderation:eval(?! -- --check)/)
  })

  it('has no way to spend more than one run at a time on a branch', () => {
    expect(WF).toMatch(/concurrency:/)
    expect(WF).toMatch(/cancel-in-progress: true/)
  })

  it('the key is the new name, never the old one', () => {
    expect(WF).not.toMatch(/ANTHROPIC_API_KEY/)
  })

  it('only reads the repository', () => {
    expect(WF).toMatch(/contents: read/)
    expect(WF).not.toMatch(/write/)
  })
})
