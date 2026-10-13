import { describe, it, expect, vi, beforeEach } from 'vitest'

// #648 part 2 — the operator records the report number NCMEC gave (the manual CyberTipline form, beta). It is a
// field on the legal hold, and recording it restarts the one-year keep from the day it was reported.

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))
vi.mock('../_lib/operator', () => ({ isOperator: (id: string) => id === 'op-1' }))

import { reportNcmecRecord } from './ncmec'
import { AuthorizationError, NotFoundError } from '../_lib/errors'

const REPORT = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-14T12:00:00Z')
const operator = { actingMemberId: 'op-1', now: () => NOW } as never
const stranger = { actingMemberId: 'someone', now: () => NOW } as never
const input = { reportId: REPORT, reportNumber: ' 123456789 ' }

beforeEach(() => query.mockReset())

describe('report.ncmec_record', () => {
  it('refuses anyone but the operator, and reads nothing', async () => {
    await expect(reportNcmecRecord(stranger, input)).rejects.toBeInstanceOf(AuthorizationError)
    expect(query).not.toHaveBeenCalled()
  })

  it('writes the number, who and when on the hold, and keeps the item a year from today', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'h1' }], rowCount: 1 })
    await expect(reportNcmecRecord(operator, input)).resolves.toEqual({ holdId: 'h1' })
    const [sql, params] = query.mock.calls[0]! as [string, unknown[]]
    expect(sql).toMatch(/update public\.legal_holds/)
    expect(sql).toMatch(/interval '1 year'/)
    expect(sql).toMatch(/greatest\(/)
    expect(params).toEqual([REPORT, '123456789', 'op-1', NOW])
  })

  it('an item with no hold is refused: only child-safety reports are held', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    await expect(reportNcmecRecord(operator, input)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('needs a number, and not an essay', async () => {
    await expect(reportNcmecRecord(operator, { ...input, reportNumber: '   ' })).rejects.toThrow()
    await expect(reportNcmecRecord(operator, { ...input, reportNumber: 'x'.repeat(61) })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('writes nothing but the hold', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'h1' }], rowCount: 1 })
    await reportNcmecRecord(operator, input)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
