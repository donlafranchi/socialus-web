// #638 (F100.9) — the evaluation harness runs on every prompt change: a workflow filtered to the files that make up
// the prompt, the models and the labelled set. It always validates the set (no key, no cost); the full run needs the
// Anthropic key as a repo secret and says plainly when it is skipped.

import { describe, it, expect, vi, afterEach } from 'vitest'
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

// The whole of criterion 9: the files that hold the prompt, the models and the labelled set each trigger the
// workflow, whose full run is the harness script; and that script, run on the committed set (the model faked),
// prints recall, false-alarm rate, severity accuracy, latency and cost per case.
// [guards F100.9]
describe('F100.9 — the harness runs on every prompt change and prints the five numbers', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
  const triggers = WF.split(/^  (?=pull_request:|push:)/m).slice(1)

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('the prompt, the models and the labelled set live in watched files, on a pull request and on main', () => {
    const where = { prompt: ['src/lib/moderation/rules.ts', /export const RULES_TEXT\b/], haiku: ['src/lib/moderation/assess.ts', /export const HAIKU = 'claude-/], sonnet: ['src/lib/moderation/assess.ts', /export const SONNET = 'claude-/], set: ['scripts/moderation-eval.ts', /`\$\{DIR\}\/cases\.json`/] } as const
    for (const [what, [file, defined]] of Object.entries(where)) expect(src(file), what).toMatch(defined)
    expect(src('scripts/moderation-eval.ts')).toMatch(/const DIR = 'evals\/moderation'/)
    expect(triggers).toHaveLength(2)
    for (const t of triggers) for (const watched of ['src/lib/moderation/rules.ts', 'src/lib/moderation/assess.ts', 'evals/moderation/**', 'scripts/moderation-eval.ts']) expect(t).toContain(`- '${watched}'`)
  })

  it('the full run is the harness script', () => {
    expect(JSON.parse(src('package.json')).scripts['moderation:eval']).toBe('tsx scripts/moderation-eval.ts')
    expect(WF).toMatch(/^\s+npm run moderation:eval$/m)
  })

  it('run on the committed set with the current models, it prints recall, false alarms, severity accuracy, latency and cost per case', async () => {
    const cases: { label: { outcome: string; severity: number } }[] = JSON.parse(src('evals/moderation/cases.json'))
    const violating = cases.filter((c) => c.label.outcome === 'remove')
    const models: string[] = []
    // A model that takes about 5ms and always says "remove, severity 2" at high confidence: every violating case caught, every clean one a false alarm.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      models.push(JSON.parse(init.body).model)
      await new Promise((r) => setTimeout(r, 5))
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { category: 'harassment', severity: 2, confidence: 0.9, outcome: 'remove', reason: 'r' } }], usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 })
    }))
    vi.stubEnv('ANTHROPIC_MODERATION_KEY', 'test-key')
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`) }) as never)
    const table = vi.spyOn(console, 'table').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await import('../scripts/moderation-eval')
    await vi.waitFor(() => expect(log.mock.calls.flat().join('\n')).toMatch(/live-mode targets/), { timeout: 10_000 })

    expect(exit).not.toHaveBeenCalled()
    const { HAIKU } = await import('../src/lib/moderation/assess')
    expect(models).toHaveLength(cases.length)
    expect(new Set(models)).toEqual(new Set([HAIKU]))
    expect(table).toHaveBeenCalledTimes(1)
    const printed = table.mock.calls[0]![0] as Record<string, number>
    expect(printed).toMatchObject({
      cases: cases.length,
      recall: 1,
      falseAlarmRate: 1,
      severityAccuracy: violating.filter((c) => c.label.severity === 2).length / violating.length,
    })
    expect(printed.meanLatencyMs).toBeGreaterThanOrEqual(4)
    expect(printed.meanCostUsd).toBeCloseTo((1000 * 1 + 100 * 5) / 1e6, 6)
    expect(log.mock.calls.filter(([line]) => /^[\w-]+: want \w+\/\d, got remove\/2 @0\.9$/.test(String(line)))).toHaveLength(cases.length)
  })
})
