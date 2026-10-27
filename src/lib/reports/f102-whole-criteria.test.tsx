// #838 — F102 criteria 8 and 12, each claimed whole by one check seen failing against a mutant.
// Criteria 3, 13 and 14 are claimed in tests/f102-answer-db.test.ts, tests/content-origins-db.test.ts and
// tests/legal-holds-db.test.ts, where the database is the part that has to hold.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ReviewQueue } from '@/app/admin/reports/ReviewQueue'
import { coordinatedPosters, groupBySubject, orderSubjects } from '@/lib/admin/review-subjects'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'
import { restoreVerdict, RESTORE_CONFIDENCE, type RestoreFacts } from '@/lib/moderation/restore-gate'
import { runAssessment } from '@/lib/moderation/run-assessment'
import { assessContent, HAIKU, SONNET, ESCALATION_THRESHOLD, type Read } from '@/lib/moderation/assess'
import { autoRestoreAfterAssessment } from '@/actions/report/ai-restore'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/actions/_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }), getPool: () => ({ query }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// The queue closes rows nobody answered after a while, read against the clock; pin it beside the fixture dates.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-13T12:00:00Z') }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ROOT = resolve(__dirname, '../../..')
const HOUR = 3_600_000
const T0 = new Date('2026-10-13T09:00:00Z').getTime()
const report = (id: string, over: Partial<QueuedReport> = {}): QueuedReport => ({
  reportId: id, body: 'x', category: 'spam', reportedAt: new Date(T0), hiddenAt: new Date(T0), removedAt: null,
  subjectKind: 'post', subjectId: id, postId: id, groupId: 'g', groupName: 'Oak Park Bakery', groupSlug: 'oak',
  photoUrl: null, ownerDisplayName: null, ownerHandle: null, history: [], ...over,
})
const noop = vi.fn(async () => {})

describe('F102.8 — coordinated reporting is flagged on the row and lifts it one tier, and nothing more', () => {
  // Three reports on one poster's content: `ages` are the reporters' account ages in days, `hours` when each came in.
  const burst = (poster: string, ages: number[], hours: number[] = [0, 1, 2]) =>
    ages.map((age, i) => report(`${poster}-${i}`, { posterId: poster, reporterAgeDays: age, reportedAt: new Date(T0 + hours[i]! * HOUR) }))

  // [guards F102.8]
  it('three reports in 24 hours, two from accounts under 7 days old, mark the row "Possible coordinated reporting" and put it first within its severity, never above a more serious one', async () => {
    // The thresholds, each side of each line.
    expect(coordinatedPosters(burst('p', [0, 6.9, 400])).has('p')).toBe(true)
    expect(coordinatedPosters(burst('p', [0, 6.9]))).toEqual(new Set()) // two reports
    expect(coordinatedPosters(burst('p', [0, 7, 400]))).toEqual(new Set()) // one under 7 days
    expect(coordinatedPosters(burst('p', [0, 1, 2], [0, 12, 24])).has('p')).toBe(true) // 24 hours exactly
    expect(coordinatedPosters(burst('p', [0, 1, 2], [0, 12, 24.1]))).toEqual(new Set()) // over a day
    // One poster's content: two posts of theirs count together; another poster's report does not join them.
    expect(coordinatedPosters([...burst('p', [0, 1]), report('q-0', { posterId: 'q', reporterAgeDays: 0 })])).toEqual(new Set())
    // The age is the account's age when it reported, read beside the report from the members table.
    const queueSql = readFileSync(resolve(ROOT, 'src/lib/admin/reports-queue.ts'), 'utf8')
    expect(queueSql).toMatch(/extract\(epoch from \(r\.created_at - rm\.created_at\)\) \/ 86400 as reporter_age_days/)
    expect(queueSql).toMatch(/left join public\.members rm on rm\.id = r\.reporter_member_id/)

    // The row says so, and within severity 4 it comes before an older unflagged spam row.
    const older = report('older', { posterId: 'other', hiddenAt: new Date(T0 - 48 * HOUR), reportedAt: new Date(T0 - 48 * HOUR) })
    const serious = report('serious', { posterId: 'third', category: 'harassment', hiddenAt: new Date(T0 + 5 * HOUR) })
    const subjects = groupBySubject([...burst('p', [0, 1, 400]), older, serious])
    expect(subjects.filter((s) => s.coordinated).map((s) => s.subjectId).sort()).toEqual(['p-0', 'p-1', 'p-2'])
    const order = orderSubjects(subjects).map((s) => s.subjectId)
    expect(order[0]).toBe('serious')
    expect(order.indexOf('older')).toBeGreaterThan(Math.max(order.indexOf('p-0'), order.indexOf('p-1'), order.indexOf('p-2')))
    render(<ReviewQueue subjects={subjects} onDecide={noop} onReverse={noop} />)
    const rows = screen.getAllByTestId('review-row')
    const flagged = rows.filter((r) => r.textContent!.includes('Possible coordinated reporting')).map((r) => r.getAttribute('data-subject'))
    expect(flagged.sort()).toEqual(['p-0', 'p-1', 'p-2'])

    // A flag, not an action: it decides nothing and restores nothing.
    expect(noop).not.toHaveBeenCalled()
    const perfect: RestoreFacts = { aiMode: 'live', cleared: true, reporterSeverities: [4], answered: true, coordinated: false,
      haiku: { model: HAIKU, severity: 4, confidence: 0.99, outcome: 'approve' }, sonnet: { model: SONNET, severity: 4, confidence: 0.99, outcome: 'approve' } }
    expect(restoreVerdict({ ...perfect, coordinated: true }).blockedBy).toEqual(['coordinated'])
  })
})

describe('F102.12 — severity 4 restores itself, narrowly, as a logged and reversible AI decision', () => {
  const POST = '77777777-7777-7777-7777-777777777777'
  const REPORT = '11111111-1111-1111-1111-111111111111'
  const read = (model: string, over: Partial<Read> = {}): Read => ({
    model, promptVersion: 'v', category: 'spam', severity: 4, confidence: 0.97, outcome: 'approve', reason: 'Fine.', latencyMs: 1, inputTokens: 1, outputTokens: 1, ...over,
  })
  const live = { aiMode: 'live', cleared: true, category: 'spam', answered: true }
  const db = (st: typeof live) => {
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (/for update of r\b/.test(sql) && /left join/.test(sql)) return { rows: [{ subject_kind: 'post', subject_id: POST, group_id: 'g1', poster_id: 'p1' }] }
      if (/from public\.moderation_settings/.test(sql)) return { rows: [{ ai_mode: st.aiMode, severity4_restore_cleared: st.cleared }] }
      if (/not exists \(select 1 from public\.report_decisions/.test(sql)) return { rows: [{ id: REPORT, category: st.category }] }
      if (/from public\.report_answers/.test(sql)) return { rows: [{ answered: st.answered }] }
      if (/insert into public\.report_decisions/.test(sql)) return { rows: [{ id: 'd1' }] }
      return { rows: [] }
    })
  }
  const sqls = (re: RegExp) => (query.mock.calls as [string, unknown[]][]).filter(([s]) => re.test(s))
  const changes = () => sqls(/insert into public\.report_decisions|update public\./)

  // [guards F102.12]
  it('restores only when the poster answered, Haiku and Sonnet both approve at 0.95 or more, nothing is coordinated and the harness cleared the slice; logs every run; attributes it to the AI; shows it for a one-tap confirm or undo; never severities 1 to 3', async () => {
    const both = [read(HAIKU), read(SONNET)]
    const restore = (reads: Read[], coordinated = false) =>
      autoRestoreAfterAssessment(REPORT, reads, { now: () => new Date(T0), isCoordinated: async () => coordinated })

    // Every condition holds: an AI decision, the post back up, and the run logged.
    db(live)
    expect(await restore(both)).toBe('restored')
    const [decision, params] = sqls(/insert into public\.report_decisions/)[0]!
    expect(decision).toMatch(/decided_by_ai/)
    expect(params).toEqual(expect.arrayContaining([REPORT, null, 'restored', 'nothing_wrong']))
    expect(String(params!.find((p) => typeof p === 'string' && p.startsWith('Restored by AI')))).toMatch(/Haiku 0\.97 and Sonnet 0\.97/)
    expect(sqls(/update public\.page_posts/)).toHaveLength(1)
    expect(sqls(/insert into public\.report_ai_restore_checks/)[0]![1]).toEqual([REPORT, 'restored', []])

    // Any one condition missing: nothing changes, and the run is logged with why.
    const blocked: [string, typeof live, Read[], boolean, string][] = [
      ['no answer', { ...live, answered: false }, both, false, 'no_answer'],
      ['Haiku under the bar', live, [read(HAIKU, { confidence: RESTORE_CONFIDENCE - 0.01 }), read(SONNET)], false, 'haiku'],
      ['Sonnet under the bar', live, [read(HAIKU), read(SONNET, { confidence: RESTORE_CONFIDENCE - 0.01 })], false, 'sonnet'],
      ['no Sonnet read', live, [read(HAIKU)], false, 'sonnet'],
      ['coordinated', live, both, true, 'coordinated'],
      ['not cleared', { ...live, cleared: false }, both, false, 'not_cleared'],
      ['shadow', { ...live, aiMode: 'shadow' }, both, false, 'shadow'],
      ['severity 3', { ...live, category: 'nudity' }, both, false, 'not_severity_4'],
      ['severity 2', { ...live, category: 'harassment' }, both, false, 'not_severity_4'],
      ['severity 1', { ...live, category: 'sensitive_content' }, both, false, 'not_severity_4'],
    ]
    for (const [why, st, reads, coordinated, block] of blocked) {
      db(st)
      expect(await restore(reads, coordinated), why).not.toBe('restored')
      expect(changes(), why).toHaveLength(0)
      expect(sqls(/insert into public\.report_ai_restore_checks/)[0]![1]![2], why).toContain(block)
    }
    // The bar is 0.95 inclusive.
    db(live)
    expect(await restore([read(HAIKU, { confidence: RESTORE_CONFIDENCE }), read(SONNET, { confidence: RESTORE_CONFIDENCE })])).toBe('restored')

    // Sonnet reads every candidate after an answer, even when Haiku is far past the escalation threshold.
    const verdict = { category: 'spam', severity: 4, confidence: 0.99, outcome: 'approve', reason: 'Fine.' }
    const reply = () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'assess', input: verdict }], usage: {} }), { status: 200 })
    const fetch = vi.fn(async () => reply())
    const restoreSpy = vi.fn(async () => undefined)
    const rows = { query: vi.fn(async (sql: string) => (/from public\.reports r/.test(sql) ? { rows: [{ category: 'spam', name: 'P', content_text: 'x', image_url: null, reporter_is_builder: false }] } : { rows: [] })) }
    expect(verdict.confidence).toBeGreaterThan(ESCALATION_THRESHOLD)
    await runAssessment(REPORT, rows, { rebuttal: 'The owner says this is a mistake.', assess: (i) => assessContent(i, { fetch, env: { ANTHROPIC_MODERATION_KEY: 'k' } }), restore: restoreSpy })
    expect((fetch.mock.calls as unknown as [string, { body: string }][]).map(([, o]) => JSON.parse(o.body).model)).toEqual([HAIKU, SONNET])
    expect(restoreSpy).toHaveBeenCalledWith(REPORT, [expect.objectContaining({ model: HAIKU }), expect.objectContaining({ model: SONNET })])

    // The batch shows it as "Restored by AI", named as the AI's, with Confirm and Undo; Undo reverses that decision.
    const byAi: PastDecision = { decisionId: 'ai1', outcome: 'restored', reasonCode: 'nothing_wrong', reasonNote: null, decidedAt: new Date(T0), decidedByName: null, reversesDecisionId: null, alreadyReversed: false, decidedByAi: true }
    const onReverse = vi.fn(async () => {})
    render(<ReviewQueue subjects={groupBySubject([report('r1', { history: [byAi] })])} onDecide={noop} onReverse={onReverse} />)
    expect(screen.getByTestId('review-ai-restored')).toHaveTextContent('Restored by AI')
    expect(screen.getByTestId('review-ai-confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('review-details'))
    expect(screen.getByTestId('review-detail')).toHaveTextContent('AI')
    await act(async () => fireEvent.click(screen.getByTestId('review-ai-undo')))
    expect(onReverse).toHaveBeenCalledWith({ decisionId: 'ai1', reasonCode: 'spam' })
  })
})
