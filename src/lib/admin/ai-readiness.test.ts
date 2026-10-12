// #640 — what the AI readiness panel reads: the last harness run, and the days of shadow reads.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))

import { fetchAiReadiness } from './ai-readiness'

const NOW = new Date('2026-10-12T12:00:00Z')

beforeEach(() => query.mockReset())

describe('fetchAiReadiness', () => {
  it('puts the last run and the shadow days through the readiness rules', async () => {
    query.mockImplementation(async (sql: string) =>
      /moderation_eval_runs/i.test(sql)
        ? { rows: [{ run_at: new Date('2026-10-10T12:00:00Z'), cases: 60, recall: '0.97', sev1_cases: 5, sev1_recall: '1', false_alarm_rate: '0.04' }] }
        : { rows: [{ days: 15 }] },
    )
    const r = await fetchAiReadiness(NOW)
    expect(r.ready).toBe(true)
    expect(r.shadow.days).toBe(14)
  })

  it('counts shadow days from the first read the AI made', async () => {
    query.mockResolvedValue({ rows: [] })
    await fetchAiReadiness(NOW)
    const sql = (query.mock.calls as unknown as [string][]).map(([s]) => s).find((s) => /report_assessments/i.test(s))!
    expect(sql).toMatch(/min\(created_at\)/i)
  })

  it('with nothing recorded and nothing read it is red and not ready', async () => {
    query.mockImplementation(async (sql: string) => (/moderation_eval_runs/i.test(sql) ? { rows: [] } : { rows: [{ days: null }] }))
    const r = await fetchAiReadiness(NOW)
    expect(r.ready).toBe(false)
    expect(r.recall.status).toBe('red')
    expect(r.shadow).toMatchObject({ days: 0, status: 'red' })
  })
})
