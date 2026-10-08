// #443 — filing: every new private report becomes one public Issue, once.

import { describe, it, expect, vi } from 'vitest'
import { filePendingReports, isStalled } from './pipeline'
import type { ProblemReportRow } from './public-issue'

const row = (id: string): ProblemReportRow => ({
  id,
  createdAt: new Date('2026-10-07T20:00:00Z'),
  memberId: 'm1',
  role: 'member',
  route: '/you',
  buildSha: 'abc1234',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1',
  description: 'It broke',
})

describe('filePendingReports', () => {
  it('files each new report as a scrubbed Issue and records which Issue it became', async () => {
    const createIssue = vi.fn().mockResolvedValueOnce(501).mockResolvedValueOnce(502)
    const markFiled = vi.fn()
    const out = await filePendingReports({ fetchNew: async () => [row('r1'), row('r2')], createIssue, markFiled })
    expect(out).toEqual({ filed: [{ reportId: 'r1', issue: 501 }, { reportId: 'r2', issue: 502 }], failed: [] })
    expect(markFiled).toHaveBeenCalledWith('r1', 501)
    expect(markFiled).toHaveBeenCalledWith('r2', 502)
    expect(createIssue.mock.calls[0]![0].body).not.toContain('m1')
  })

  it('a failure on one report leaves it for the next run and does not stop the others', async () => {
    const createIssue = vi.fn().mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(502)
    const markFiled = vi.fn()
    const out = await filePendingReports({ fetchNew: async () => [row('r1'), row('r2')], createIssue, markFiled })
    expect(out.failed).toEqual([{ reportId: 'r1', error: '403' }])
    expect(out.filed).toEqual([{ reportId: 'r2', issue: 502 }])
    expect(markFiled).toHaveBeenCalledTimes(1)
    expect(markFiled).not.toHaveBeenCalledWith('r1', expect.anything())
  })

  it('hands the new Issue to triage when there is a triager, and a triage failure never loses the filing', async () => {
    const triage = vi.fn().mockRejectedValue(new Error('model down'))
    const markFiled = vi.fn()
    const out = await filePendingReports({ fetchNew: async () => [row('r1')], createIssue: async () => 501, markFiled, triage })
    expect(triage).toHaveBeenCalledWith(501, expect.objectContaining({ id: 'r1' }))
    expect(out.filed).toEqual([{ reportId: 'r1', issue: 501 }])
    expect(markFiled).toHaveBeenCalledWith('r1', 501)
  })

  it('stops at the per-run limit, so one flood cannot become a burst of Issues and model calls', async () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`r${i}`))
    const createIssue = vi.fn(async () => 1)
    await filePendingReports({ fetchNew: async () => many, createIssue, markFiled: vi.fn() }, { limit: 10 })
    expect(createIssue).toHaveBeenCalledTimes(10)
  })
})

describe('isStalled — the heartbeat', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  it('is stalled when the last good run is over a day ago, or there never was one', () => {
    expect(isStalled(new Date('2026-10-07T09:00:00Z'), now)).toBe(true)
    expect(isStalled(null, now)).toBe(true)
  })
  it('is fine when the pipeline ran in the last day', () => {
    expect(isStalled(new Date('2026-10-08T11:30:00Z'), now)).toBe(false)
  })
})
