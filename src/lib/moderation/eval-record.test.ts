// #640 — a harness run is recorded so the AI readiness panel can show it.

import { describe, it, expect, vi } from 'vitest'
import { recordEvalRun, lastEvalRun } from './eval-record'

const SUMMARY = { cases: 60, sev1Cases: 5, recall: 0.97, sev1Recall: 1, falseAlarmRate: 0.04, meetsLiveTargets: true }

describe('recordEvalRun', () => {
  it('writes the run once, with the numbers the panel shows', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    await recordEvalRun({ query } as never, SUMMARY)
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/insert into public\.moderation_eval_runs/i)
    expect(params).toEqual([60, 0.97, 5, 1, 0.04, true])
  })
})

describe('lastEvalRun', () => {
  it('reads the latest run as the panel needs it', async () => {
    const at = new Date('2026-10-10T12:00:00Z')
    const query = vi.fn(async () => ({ rows: [{ run_at: at, cases: 60, recall: '0.97', sev1_cases: 5, sev1_recall: '1', false_alarm_rate: '0.04' }] }))
    expect(await lastEvalRun({ query } as never)).toEqual({ runAt: at, cases: 60, recall: 0.97, sev1Cases: 5, sev1Recall: 1, falseAlarmRate: 0.04 })
    expect((query.mock.calls[0] as unknown as [string])[0]).toMatch(/order by run_at desc limit 1/i)
  })

  it('is null when nothing has been run', async () => {
    expect(await lastEvalRun({ query: vi.fn(async () => ({ rows: [] })) } as never)).toBeNull()
  })
})
