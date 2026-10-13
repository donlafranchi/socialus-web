// #649 (F102 criteria 1, 3, 9) and #650 (criteria 5, 13, 14) — checks that claim the whole criterion and standing
// guards for the never-rules, each seen failing against a mutant (build-log/2026-W42/645-f102-checks.md).
// Criteria 2, 4, 10 and 11 are marked beside the code they test.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { YouNotices, type Notice } from '@/components/member/YouNotices'
import { hiddenNoticeMessage } from './notices'
import { URGENT_CATEGORIES, SEVERITY_OF_REPORT_CATEGORY, REPORT_CATEGORIES } from './categories'
import { restoreVerdict, isRestoreCandidate } from '@/lib/moderation/restore-gate'
import { runAssessment } from '@/lib/moderation/run-assessment'
import { reportAnswer } from '@/actions/report/answer'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/actions/_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }), getPool: () => ({ query }) }))
vi.mock('@/actions/_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

afterEach(cleanup)

const ROOT = resolve(__dirname, '../../..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}
const SRC = sources(join(ROOT, 'src'))
const rel = (p: string) => p.slice(ROOT.length + 1)
const naming = (re: RegExp) => SRC.filter((p) => re.test(readFileSync(p, 'utf8'))).map(rel).sort()

describe('F102.1 — the poster is told the category and the reporter\'s reason, and gets one answer', () => {
  const notice = (over: Partial<Notice> = {}): Notice => ({
    id: 'n1', kind: 'content_hidden', createdAt: '2026-10-07T12:00:00Z', subjectKind: 'post', pageHandle: 'qa0b01', answer: null, closed: false,
    message: hiddenNoticeMessage('Oak Park Bakery', 'spam', 'post'), ...over,
  })

  // [guards F102.1]
  it('a hide leaves the poster a message naming the reporter\'s reason and the Page, and offers the two answers, fix it or say it is a mistake', async () => {
    const onAnswer = vi.fn(async () => {})
    render(<YouNotices notices={[notice()]} onAnswer={onAnswer} />)
    const text = screen.getByTestId('you-notices').textContent!
    expect(text).toContain('Spam')
    expect(text).toContain('Oak Park Bakery')
    expect(screen.getByRole('link', { name: /fix it/i })).toHaveAttribute('href', '/g/qa0b01')
    fireEvent.click(screen.getByRole('button', { name: /this is a mistake/i }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ noticeId: 'n1' }))
    // One answer: afterwards neither is offered again.
    await waitFor(() => expect(screen.queryByRole('button', { name: /this is a mistake/i })).toBeNull())
    expect(screen.queryByRole('link', { name: /fix it/i })).toBeNull()
    // Every category the reporter can choose is named in its own words in the message.
    for (const c of REPORT_CATEGORIES) expect(hiddenNoticeMessage('P', c.value, 'post')).toContain(c.label)
  })
})

describe('F102.3 — saying the report is wrong goes to the AI pass and the row, and the content stays hidden', () => {
  // [guards F102.3 partial: one answer per hide, the owner's only, writes nothing but the answer; the three reasons and the note are superseded by the single "This is a mistake" button (#626, PM 2026-10-12)]
  it('records one answer, from the person the notice went to, and changes nothing that is hidden', async () => {
    const me = '11111111-1111-1111-1111-111111111111'
    const ctx = { actingMemberId: me, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date('2026-10-10T12:00:00Z') } as never
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (/from public\.member_notices/i.test(sql)) return { rows: [{ id: 'n', member_id: me, report_id: 'r', created_at: new Date('2026-10-07T12:00:00Z'), answered: false }] }
      if (/insert into public\.report_answers/i.test(sql)) return { rows: [{ id: 'a' }] }
      throw new Error('unexpected ' + sql)
    })
    await reportAnswer(ctx, { noticeId: '22222222-2222-2222-2222-222222222222' })
    const writes = (query.mock.calls as [string][]).filter(([q]) => /^\s*(insert|update|delete)/i.test(q))
    expect(writes).toHaveLength(1)
    expect(writes[0]![0]).toMatch(/report_answers/)
    expect(readFileSync(join(ROOT, 'src/app/_actions/report-actions.ts'), 'utf8')).toMatch(/assessAfterReport\(r\.reportId, \{ rebuttal:/)
  })
})

describe('F102.9 — Tuesday to Thursday, with no person', () => {
  const perfect = { aiMode: 'live' as const, cleared: true, answered: true, coordinated: false,
    haiku: { model: 'h', severity: 4, confidence: 0.99, outcome: 'approve' as const }, sonnet: { model: 's', severity: 4, confidence: 0.99, outcome: 'approve' as const } }

  // [guards F102.9]
  it('severities 1 to 3 stay hidden whatever the AI says, and severity 1 texts the operator', () => {
    for (const s of [1, 2, 3] as const) {
      const v = restoreVerdict({ ...perfect, reporterSeverities: [s], haiku: { ...perfect.haiku, severity: s }, sonnet: { ...perfect.sonnet, severity: s } })
      expect(v.act, `severity ${s}`).toBe(false)
      expect(v.wouldRestore, `severity ${s}`).toBe(false)
    }
    // Either side saying a higher tier is enough to keep it down: the reporter's reason alone, or the AI's read alone.
    expect(restoreVerdict({ ...perfect, reporterSeverities: [2] }).act).toBe(false)
    expect(restoreVerdict({ ...perfect, reporterSeverities: [4], haiku: { ...perfect.haiku, severity: 2 } }).act).toBe(false)
    expect(restoreVerdict({ ...perfect, reporterSeverities: [4] }).act).toBe(true) // the narrow, ruled exception
    expect(restoreVerdict({ ...perfect, reporterSeverities: [4], answered: false }).act).toBe(false)
    // Severity 1 (Sensitive content) and threat of harm hide at once and text the operator.
    expect([...URGENT_CATEGORIES].sort()).toEqual(['sensitive_content', 'threat_of_harm'])
    const create = readFileSync(join(ROOT, 'src/actions/report/create.ts'), 'utf8')
    expect(create).toMatch(/urgent && !subject\.reporterIsBuilder && !subject\.builderOnReal\) textAfterCommit = true/)
    expect(create).toMatch(/await alertOperator\(/)
    // An answer on a hide is recorded and nothing else changes: the content waits for the batch.
    expect(readFileSync(join(ROOT, 'src/actions/report/answer.ts'), 'utf8')).toMatch(/the content stays down until a person decides/)
  })
})

describe('F102.5 — the reporter counters are the report path\'s alone', () => {
  // [guards F102.5]
  it('only the report path and the operator\'s queue name a reporter\'s counters or reports', () => {
    expect(naming(/r_filed|r_upheld|r_dismissed|dismissalTimes|reporter_member_id/)).toEqual([
      'src/actions/report/create.ts',
      'src/lib/admin/reports-queue.ts',
      'src/lib/moderation/run-assessment.ts',
    ])
    // And no member-facing surface can read them: the tables have no client policy, and nothing client-side asks.
    expect(naming(/\.from\(['"]reports['"]\)\s*\.select/)).toEqual([])
    expect(naming(/reporter\??: \{ filed/).every((p) => p.startsWith('src/lib/admin/') || p.startsWith('src/app/admin/'))).toBe(true)
  })

  it('the guard sees a feature that reads them', () => {
    expect(/r_filed|reporter_member_id/.test('select r_filed from reports')).toBe(true)
  })
})

describe('F102.13 — the address and time of every write are the report path\'s alone', () => {
  // [guards F102.13 partial: only the recording handler names the origins table; nothing reads it for a feature]
  it('content_origins is named by one handler and by no surface or feature', () => {
    expect(naming(/content_origins/)).toEqual(['src/actions/origin/record.ts'])
    expect(naming(/recordOrigin\(/).filter((p) => p.startsWith('src/components/'))).toEqual([])
  })
})

describe('F102.14 — child-safety content never goes back to the poster, never to an AI, never auto-restores', () => {
  const create = readFileSync(join(ROOT, 'src/actions/report/create.ts'), 'utf8')
  const post = readFileSync(join(ROOT, 'src/actions/group/post.ts'), 'utf8')

  // [guards F102.14 partial: severity 1 sends no notice and no courtesy notice, is skipped by the AI, never a restore candidate, and an edit never reposts it; the NCMEC preservation and report are not built (#648)]
  it('the most serious kind: no word to the poster, no AI read, no auto-restore, no repost by editing', async () => {
    // Never back to the poster: the sensitive-content branch writes no notice.
    expect(create).toMatch(/input\.category !== 'sensitive_content' && !subject\.reporterIsBuilder/)
    expect(create).toMatch(/!urgent &&/)
    expect(SEVERITY_OF_REPORT_CATEGORY.sensitive_content).toBe(1)
    // Never to an AI: the run is skipped, and says why.
    const inserts: string[] = []
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (/from public\.reports r/i.test(sql)) return { rows: [{ category: 'sensitive_content', subject_kind: 'post', name: 'P', content_text: 'x', image_url: 'https://x.test/a.png', reporter_is_builder: false }] }
        inserts.push(`${sql}|${JSON.stringify(params)}`)
        return { rows: [] }
      }),
    }
    const assess = vi.fn()
    const fetchImage = vi.fn()
    await runAssessment('r1', db, { assess, fetchImage })
    expect(assess).not.toHaveBeenCalled()
    expect(fetchImage).not.toHaveBeenCalled()
    expect(inserts.join('\n')).toMatch(/suspected severity 1/)
    // Never auto-restores: not a candidate, and the gate says severity.
    expect(isRestoreCandidate({ model: 'h', severity: 1, confidence: 0.99, outcome: 'approve' }, { rebuttal: 'it is fine', reporterSeverity: 1 })).toBe(false)
    expect(restoreVerdict({ aiMode: 'live', cleared: true, reporterSeverities: [1], answered: true, coordinated: false, haiku: null, sonnet: null }).act).toBe(false)
    // Never reposted by the poster editing it.
    expect(post).toMatch(/!post\.repost_used && !post\.severity_one/)
  })
})
