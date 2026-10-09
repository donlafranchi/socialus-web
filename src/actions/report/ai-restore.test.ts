import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (/\.(tsx?|json|sql|mjs)$/.test(e.name)) acc.push(full)
  }
  return acc
}

// F102 criterion 12 — the orchestration around the gate: what it reads, what it
// records in every mode, and that only a live, cleared, fully-agreeing run acts.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))

import { autoRestoreAfterAssessment } from './ai-restore'
import { HAIKU, SONNET, type Read } from '@/lib/moderation/assess'

const REPORT = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const POST = '77777777-7777-7777-7777-777777777777'
const NOW = new Date('2026-10-09T12:00:00Z')

const read = (model: string, over: Partial<Read> = {}): Read => ({
  model, promptVersion: 'v', category: 'spam', severity: 4, confidence: 0.97, outcome: 'approve',
  reason: 'Fine.', latencyMs: 1, inputTokens: 1, outputTokens: 1, ...over,
})
const REPLIES = [read(HAIKU), read(SONNET)]

let st: { aiMode: string; cleared: boolean; open: { id: string; category: string | null }[]; answered: boolean; subjectKind: string }

beforeEach(() => {
  query.mockReset()
  st = { aiMode: 'live', cleared: true, open: [{ id: REPORT, category: 'spam' }], answered: true, subjectKind: 'post' }
  query.mockImplementation(async (sql: string) => {
    if (/for update of r\b/.test(sql) && /left join/.test(sql)) return { rows: [{ subject_kind: st.subjectKind, subject_id: POST, group_id: 'g1', poster_id: 'p1' }] }
    if (/from public\.moderation_settings/.test(sql)) return { rows: [{ ai_mode: st.aiMode, severity4_restore_cleared: st.cleared }] }
    if (/not exists \(select 1 from public\.report_decisions/.test(sql)) return { rows: st.open }
    if (/from public\.report_answers/.test(sql)) return { rows: [{ answered: st.answered }] }
    if (/insert into public\.report_decisions/.test(sql)) return { rows: [{ id: 'd1' }] }
    return { rows: [] }
  })
})

const deps = (coordinated = false) => ({ now: () => NOW, isCoordinated: async () => coordinated })
const sqls = (re: RegExp) => (query.mock.calls as [string, unknown[]][]).filter(([s]) => re.test(s))
const check = () => sqls(/insert into public\.report_ai_restore_checks/)[0]![1]
const changes = () => sqls(/insert into public\.report_decisions|update public\./)

describe('F102.12 — autoRestoreAfterAssessment', () => {
  it('live, cleared, everything agreeing: records an AI decision, restores the post, and logs it', async () => {
    expect(await autoRestoreAfterAssessment(REPORT, REPLIES, deps())).toBe('restored')
    const [sql, p] = sqls(/insert into public\.report_decisions/)[0]!
    expect(sql).toMatch(/decided_by_ai/)
    expect(p).toEqual(expect.arrayContaining([REPORT, null, 'restored', 'nothing_wrong']))
    expect(sqls(/update public\.page_posts/)).toHaveLength(1)
    expect(sqls(/update public\.reports/)).toHaveLength(1)
    expect(check()).toEqual(expect.arrayContaining([REPORT, 'restored']))
  })

  it('shadow: changes nothing, records a would-restore', async () => {
    st.aiMode = 'shadow'
    expect(await autoRestoreAfterAssessment(REPORT, REPLIES, deps())).toBe('would_restore')
    expect(changes()).toHaveLength(0)
    expect(check()).toEqual(expect.arrayContaining([REPORT, 'would_restore', ['shadow']]))
  })

  it('live but not cleared by the harness: changes nothing, records a would-restore', async () => {
    st.cleared = false
    expect(await autoRestoreAfterAssessment(REPORT, REPLIES, deps())).toBe('would_restore')
    expect(changes()).toHaveLength(0)
    expect(check()).toEqual(expect.arrayContaining(['would_restore', ['not_cleared']]))
  })

  it.each([
    ['the poster has not answered', () => { st.answered = false }, REPLIES, false],
    ['reporting looks coordinated', () => {}, REPLIES, true],
    ['Sonnet disagrees', () => {}, [read(HAIKU), read(SONNET, { outcome: 'remove' })], false],
    ['Sonnet never read', () => {}, [read(HAIKU)], false],
    ['a reporter chose a more serious reason', () => { st.open = [{ id: REPORT, category: 'spam' }, { id: OTHER, category: 'harassment' }] }, REPLIES, false],
    ['a report names no reason', () => { st.open = [{ id: REPORT, category: null }] }, REPLIES, false],
  ] as const)('%s: nothing changes and the block is logged', async (_n, setup, reads, coordinated) => {
    setup()
    expect(await autoRestoreAfterAssessment(REPORT, [...reads], deps(coordinated))).toBe('blocked')
    expect(changes()).toHaveLength(0)
    expect(check()).toEqual(expect.arrayContaining(['blocked']))
  })

  it('a report someone has already decided is left alone and not logged', async () => {
    st.open = []
    expect(await autoRestoreAfterAssessment(REPORT, REPLIES, deps())).toBe('skipped')
    expect(sqls(/insert into/)).toHaveLength(0)
  })

  it('every open report on the subject gets the AI decision when all are severity 4', async () => {
    st.open = [{ id: REPORT, category: 'spam' }, { id: OTHER, category: 'other' }]
    await autoRestoreAfterAssessment(REPORT, REPLIES, deps())
    expect(sqls(/insert into public\.report_decisions/)).toHaveLength(2)
  })

  it('does not ask whether reporting is coordinated unless everything else passed', async () => {
    st.answered = false
    const isCoordinated = vi.fn(async () => false)
    await autoRestoreAfterAssessment(REPORT, REPLIES, { now: () => NOW, isCoordinated })
    expect(isCoordinated).not.toHaveBeenCalled()
  })

  it('a failed coordination check blocks rather than restores', async () => {
    const isCoordinated = vi.fn(async () => {
      throw new Error('db down')
    })
    expect(await autoRestoreAfterAssessment(REPORT, REPLIES, { now: () => NOW, isCoordinated })).toBe('blocked')
    expect(changes()).toHaveLength(0)
  })

  it('no code path sets the clearance flag: only an operator or direct data change does', () => {
    const files = [...walk('src'), ...walk('scripts')].filter((f) => readFileSync(f, 'utf8').includes('severity4_restore_cleared'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      if (f.endsWith('.test.ts')) continue
      expect(readFileSync(f, 'utf8')).not.toMatch(/severity4_restore_cleared\s*=(?!=)/)
    }
  })
})
