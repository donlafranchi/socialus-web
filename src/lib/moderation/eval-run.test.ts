import { describe, it, expect, vi } from 'vitest'
import { runSet } from './eval-run'
import type { EvalCase } from './eval-cases'

// F100 criterion 9 — the runner wires cases, pictures, the model call and the
// summary together. The model is faked here; the real run needs a key.

const cases: EvalCase[] = [
  { id: 'a', text: 'Bread', image: 'a.png', reporterReason: 'Spam', label: { outcome: 'approve', severity: 4 } },
  { id: 'b', text: 'Insult', reporterReason: 'Harassment', label: { outcome: 'remove', severity: 2 } },
]

const answer = (outcome: 'approve' | 'remove', severity: number) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { category: 'other', severity, confidence: 0.9, outcome, reason: 'r' } }], usage: { input_tokens: 1000, output_tokens: 100 } }), { status: 200 })

describe('runSet', () => {
  it('sends each case, with its picture as bytes, and summarises against the labels', async () => {
    const fetch = vi.fn(async (_u: string, init: { body: string }) => (JSON.parse(init.body).messages[0].content[1]?.text?.includes('Insult') || init.body.includes('Insult') ? answer('remove', 2) : answer('approve', 4)))
    const out = await runSet(cases, { fetch: fetch as never, env: { ANTHROPIC_API_KEY: 'k' }, readImage: () => ({ mediaType: 'image/png', base64: 'AAAA' }) })
    expect(out.summary.recall).toBe(1)
    expect(out.summary.falseAlarmRate).toBe(0)
    expect(out.summary.meetsLiveTargets).toBe(true)
    expect(out.rows).toHaveLength(2)
    const first = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(first.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', data: 'AAAA' } })
  })

  it('a model that misses a violating case fails the live gate', async () => {
    const fetch = vi.fn(async () => answer('approve', 4))
    const out = await runSet(cases, { fetch: fetch as never, env: { ANTHROPIC_API_KEY: 'k' }, readImage: () => null })
    expect(out.summary.recall).toBe(0)
    expect(out.summary.meetsLiveTargets).toBe(false)
  })

  it('costs are added up from the tokens each read used', async () => {
    const fetch = vi.fn(async () => answer('approve', 4))
    const out = await runSet([cases[0]!], { fetch: fetch as never, env: { ANTHROPIC_API_KEY: 'k' }, readImage: () => null })
    expect(out.summary.meanCostUsd).toBeGreaterThan(0)
  })
})
