// #642 (F100 criteria 1, 2, 8) — checks that claim the whole criterion, each seen failing against a mutant
// (build-log/2026-W42/642-f100-guards-and-checks.md lists the mutants).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { run, after, query } = vi.hoisted(() => ({
  run: vi.fn(async (..._a: unknown[]) => undefined as unknown),
  after: vi.fn(),
  query: vi.fn(),
}))
vi.mock('next/server', () => ({ after }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))
vi.mock('./run-assessment', () => ({ runAssessment: run }))

import { assessAfterReport } from './after-report'
import { assessContent, HAIKU, SONNET } from './assess'
import { ASSESS_CATEGORIES } from './rules'
import { fetchAiMode } from '@/lib/admin/reports-queue'
import { groupBySubject, orderSubjects } from '@/lib/admin/review-subjects'
import type { QueuedReport } from '@/lib/admin/reports-queue'

const ROOT = resolve(__dirname, '../../..')
const file = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

beforeEach(() => {
  run.mockReset()
  run.mockResolvedValue(undefined)
  after.mockReset()
  query.mockReset()
  process.env.ANTHROPIC_MODERATION_KEY = 'sk-test'
})

describe('F100.1 — every report and every rebuttal triggers one assessment, after the report is stored', () => {
  // [guards F100.1]
  it('a report and a rebuttal each schedule exactly one read for after the response, and a failed or slow read changes nothing', async () => {
    // The two doors: report.create after its transaction commits, and a poster's reply.
    const create = file('src/actions/report/create.ts')
    expect(create.indexOf('assessAfterReport(result.reportId)')).toBeGreaterThan(create.indexOf('const result = await withTransaction'))
    expect(create.match(/assessAfterReport\(/g)).toHaveLength(1)
    expect(file('src/app/_actions/report-actions.ts')).toMatch(/assessAfterReport\(r\.reportId, \{ rebuttal:/)

    // One read each, deferred until after the response (nothing runs until the framework runs the job).
    assessAfterReport('r1')
    assessAfterReport('r1', { rebuttal: 'He reports everything.' })
    expect(after).toHaveBeenCalledTimes(2)
    expect(run).not.toHaveBeenCalled()
    for (const [job] of after.mock.calls as [() => Promise<unknown>][]) await job()
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(1, 'r1', expect.anything(), { rebuttal: null })
    expect(run).toHaveBeenNthCalledWith(2, 'r1', expect.anything(), { rebuttal: 'He reports everything.' })

    // A failed read is logged and swallowed; a slow one is never awaited by the caller.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    run.mockRejectedValueOnce(new Error('model down'))
    after.mockClear()
    assessAfterReport('r2')
    await expect((after.mock.calls[0] as [() => Promise<unknown>])[0]()).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    run.mockImplementationOnce(() => new Promise(() => {}))
    after.mockClear()
    expect(() => assessAfterReport('r3')).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})

describe('F100.2 — Haiku first, text and vision, a structured answer', () => {
  const answer = (over: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ content: [{ type: 'tool_use', input: { category: 'spam', severity: 4, confidence: 0.9, outcome: 'approve', reason: 'ok', ...over } }], usage: { input_tokens: 5, output_tokens: 3 } }), { status: 200 })
  const ENV = { ANTHROPIC_MODERATION_KEY: 'k' }
  const input = { text: 'Bread', image: { mediaType: 'image/png', base64: 'AAAA' }, reporterReason: 'Spam', rebuttal: null }

  // [guards F100.2]
  it('reads with Haiku first, sends text and a picture, and takes only a well-formed answer', async () => {
    const f = vi.fn(async () => answer())
    const out = await assessContent(input, { fetch: f as never, env: ENV })
    expect(out?.reads).toHaveLength(1) // confident: no second opinion
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.model).toBe(HAIKU)
    expect(HAIKU).toBe('claude-haiku-4-5-20251001')
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })
    expect(body.messages[0].content[1].text).toContain('Bread')
    // The structured answer: category, severity 1–4, confidence 0–1, outcome, reason of at most 140.
    const schema = body.tools[0].input_schema
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'assess' })
    expect(schema.properties.category.enum).toEqual([...ASSESS_CATEGORIES])
    expect(schema.properties.severity).toMatchObject({ type: 'integer', minimum: 1, maximum: 4 })
    expect(schema.properties.confidence).toMatchObject({ type: 'number', minimum: 0, maximum: 1 })
    expect(schema.properties.outcome.enum).toEqual(['approve', 'remove'])
    expect(schema.required).toEqual(['category', 'severity', 'confidence', 'outcome', 'reason'])
    expect(out!.shown).toMatchObject({ model: HAIKU, category: 'spam', severity: 4, confidence: 0.9, outcome: 'approve', reason: 'ok' })
    // Every field has its range: anything outside it is no read at all.
    for (const bad of [{ severity: 0 }, { severity: 5 }, { severity: 2.5 }, { confidence: -0.1 }, { confidence: 1.1 }, { outcome: 'maybe' }, { category: 'gossip' }, { reason: '' }]) {
      expect(await assessContent(input, { fetch: (async () => answer(bad)) as never, env: ENV }), JSON.stringify(bad)).toBeNull()
    }
    // A reason over 140 characters is cut to 140.
    const long = await assessContent(input, { fetch: (async () => answer({ reason: 'x'.repeat(300) })) as never, env: ENV })
    expect(long!.shown.reason).toHaveLength(140)
    expect(SONNET).toBe('claude-sonnet-5-5')
  })
})

describe('F100.8 — live mode is data; live raises a row\'s severity and order, and a person still taps', () => {
  const report = (id: string, over: Partial<QueuedReport>): QueuedReport => ({
    reportId: id, body: 'x', category: 'spam', reportedAt: new Date('2026-10-01T00:00:00Z'), hiddenAt: new Date('2026-10-02T00:00:00Z'), removedAt: null,
    groupId: id, groupName: id, groupSlug: id, photoUrl: null, ownerDisplayName: null, ownerHandle: null, history: [], subjectKind: 'group', subjectId: id, ...over,
  })

  // [guards F100.8]
  it('the mode is a row, shadow unless it says live; live lets the AI raise severity and order; deciding stays a person\'s tap', async () => {
    // Data, not a deploy: read from the settings row, and anything but 'live' (no row, a typo) is shadow.
    query.mockResolvedValueOnce({ rows: [{ ai_mode: 'live' }] })
    expect(await fetchAiMode()).toBe('live')
    for (const rows of [[{ ai_mode: 'shadow' }], [], [{ ai_mode: 'LIVE' }], [{ ai_mode: null }]]) {
      query.mockResolvedValueOnce({ rows })
      expect(await fetchAiMode()).toBe('shadow')
    }
    expect(file('src/lib/admin/reports-queue.ts')).toMatch(/select ai_mode from public\.moderation_settings/)

    // Live raises a row's severity and so its order, and never lowers it; shadow does neither.
    const plain = report('plain', { category: 'harassment' }) // severity 2 by the reporter's reason
    const raised = report('raised', { category: 'spam', ai: { category: 'threats', severity: 1, confidence: 0.95, outcome: 'remove', reason: 'a threat' } }) // reporter says 4
    const lowered = report('lowered', { category: 'harassment', ai: { category: 'spam', severity: 4, confidence: 0.9, outcome: 'approve', reason: 'fine' } })
    const rows = [plain, raised, lowered]
    const live = orderSubjects(groupBySubject(rows, { live: true }))
    const shadow = orderSubjects(groupBySubject(rows, { live: false }))
    expect(live.find((s) => s.subjectId === 'raised')!.severity).toBe(1)
    expect(live[0]!.subjectId).toBe('raised')
    expect(live.find((s) => s.subjectId === 'lowered')!.severity).toBe(2)
    expect(shadow.find((s) => s.subjectId === 'raised')!.severity).toBe(4)

    // Remove, restore and the strikes stay a person's tap: the only caller of the decision handlers is the staff action.
    for (const p of ['src/lib/moderation/run-assessment.ts', 'src/lib/moderation/assess.ts', 'src/lib/moderation/after-report.ts']) {
      expect(file(p)).not.toMatch(/reportDecide|reportReverse|decideReportAction/)
    }
  })
})
