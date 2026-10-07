// #280 — the real operator's queue holds no builder report and no report on a
// builder Page; the builder operator's holds both.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn(async () => ({ rows: [] }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))

import { fetchReviewQueue } from './reports-queue'

beforeEach(() => query.mockClear())

describe('#280 — builders in the report queue', () => {
  it('leaves builder reports and builder Pages out by default', async () => {
    await fetchReviewQueue()
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/\$2 or \(not public\.is_builder\(r\.reporter_member_id\) and not public\.is_builder\(pg\.founder_member_id\)\)/)
    expect(params[1]).toBe(false)
  })

  it('includes them for the builder operator', async () => {
    await fetchReviewQueue(50, { includeBuilders: true })
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(params[1]).toBe(true)
  })
})
