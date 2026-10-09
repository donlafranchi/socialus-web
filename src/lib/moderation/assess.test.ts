import { describe, it, expect, vi } from 'vitest'
import { assessContent, ESCALATION_THRESHOLD, HAIKU, SONNET } from './assess'
import { RULES_VERSION } from './rules'

// F100 — Haiku reads first, Sonnet second when Haiku is unsure; what leaves the
// platform is the content, the reporter's chosen reason and the poster's
// rebuttal, and nothing that names a member.

const verdict = (over: Record<string, unknown> = {}) => ({
  category: 'harassment',
  severity: 2,
  confidence: 0.9,
  outcome: 'remove',
  reason: 'Insults a neighbour.',
  ...over,
})

const reply = (v: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'assess', input: v }], usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200 })

const input = { text: 'A post about the bakery.', image: null, reporterReason: 'Harassment', rebuttal: null }
const env = { ANTHROPIC_API_KEY: 'sk-test' }

describe('F100 — assessContent', () => {
  // [guards F100.2 partial: the shape; the live model is the harness's]
  it('asks Haiku for a structured read and returns it', async () => {
    const fetch = vi.fn(async () => reply(verdict()))
    const r = (await assessContent(input, { fetch, env }))!
    expect(r.reads).toHaveLength(1)
    expect(r.reads[0]).toMatchObject({ model: HAIKU, category: 'harassment', severity: 2, confidence: 0.9, outcome: 'remove' })
    expect(r.shown).toBe(r.reads[0])
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.model).toBe(HAIKU)
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'assess' })
  })

  // [guards F100.3]
  it('below the threshold Sonnet gives a second opinion, both are kept, the second is shown', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(verdict({ confidence: ESCALATION_THRESHOLD - 0.1 })))
      .mockResolvedValueOnce(reply(verdict({ confidence: 0.81 })))
    const r = (await assessContent(input, { fetch, env }))!
    expect(r.reads.map((x) => x.model)).toEqual([HAIKU, SONNET])
    expect(r.shown.model).toBe(SONNET)
  })

  it('at or above the threshold Sonnet is not called', async () => {
    const fetch = vi.fn(async () => reply(verdict({ confidence: ESCALATION_THRESHOLD })))
    const r = (await assessContent(input, { fetch, env }))!
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(r.reads).toHaveLength(1)
  })

  // [guards F102.12 partial: Sonnet runs on every restore candidate; the gate is restore-gate]
  it('Sonnet also reads when the caller asks for a second opinion on a confident first read', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(verdict({ severity: 4, confidence: 0.97, outcome: 'approve' })))
      .mockResolvedValueOnce(reply(verdict({ severity: 4, confidence: 0.96, outcome: 'approve' })))
    const secondOpinionIf = vi.fn(() => true)
    const r = (await assessContent({ ...input, secondOpinionIf }, { fetch, env }))!
    expect(secondOpinionIf).toHaveBeenCalledWith(expect.objectContaining({ model: HAIKU, confidence: 0.97 }))
    expect(r.reads.map((x) => x.model)).toEqual([HAIKU, SONNET])
    // The predicate is a local callback: it never goes to the provider.
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('secondOpinionIf')
  })

  it('does not call Sonnet when the predicate says no', async () => {
    const fetch = vi.fn(async () => reply(verdict({ confidence: 0.97 })))
    await assessContent({ ...input, secondOpinionIf: () => false }, { fetch, env })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // [guards F100.4]
  it('sends the content, the reporter\'s reason and the rebuttal, versioned rules, and no member identity', async () => {
    const fetch = vi.fn(async () => reply(verdict()))
    await assessContent({ ...input, rebuttal: 'It is my shop sign.' }, { fetch, env })
    const sent = (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    expect(sent).toContain('A post about the bakery.')
    expect(sent).toContain('Harassment')
    expect(sent).toContain('It is my shop sign.')
    expect(sent).toContain(RULES_VERSION)
    expect(sent).not.toContain('@')
  })

  it('sends a photo as bytes, never as a URL that names its owner', async () => {
    const fetch = vi.fn(async () => reply(verdict()))
    await assessContent({ ...input, image: { mediaType: 'image/jpeg', base64: 'AAAA' } }, { fetch, env })
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    const block = body.messages[0].content.find((c: { type: string }) => c.type === 'image')
    expect(block.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAAA' })
  })

  it('a reason over 140 characters is cut, not refused', async () => {
    const fetch = vi.fn(async () => reply(verdict({ reason: 'x'.repeat(300) })))
    const r = (await assessContent(input, { fetch, env }))!
    expect(r.shown.reason.length).toBe(140)
  })

  // [guards F100.1 partial: a failed or slow call leaves the report as it was]
  it('a failed call returns null rather than throwing', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 500 }))
    expect(await assessContent(input, { fetch, env })).toBeNull()
  })

  it('a malformed answer returns null', async () => {
    const fetch = vi.fn(async () => reply({ category: 'invented' }))
    expect(await assessContent(input, { fetch, env })).toBeNull()
  })

  it('no API key, no call', async () => {
    const fetch = vi.fn()
    expect(await assessContent(input, { fetch, env: {} })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
