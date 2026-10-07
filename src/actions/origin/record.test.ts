import { describe, it, expect, vi, beforeEach } from 'vitest'

// F102 criterion 13 — every post and upload records where it came from.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

import { originRecord } from './record'
import { AuthorizationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const NOW = new Date('2026-10-07T12:00:00Z')
const ctx = (id: string | null = MEMBER): ActionContext =>
  ({ actingMemberId: id as string, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }) as ActionContext

beforeEach(() => {
  query.mockReset()
  query.mockResolvedValue({ rows: [] })
})

describe('origin.record', () => {
  it('stores who, what, the address and the time', async () => {
    await originRecord(ctx(), { kind: 'post', ref: 'abc', ip: '203.0.113.7' })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/insert into public\.content_origins/)
    expect(params).toEqual([MEMBER, 'post', 'abc', '203.0.113.7', NOW])
  })

  it('an unknown address is stored as unknown, not refused: the post still stands', async () => {
    await originRecord(ctx(), { kind: 'upload', ref: 'https://x.test/m/a.webp', ip: null })
    expect((query.mock.calls[0] as [string, unknown[]])[1][3]).toBeNull()
  })

  it('only posts and uploads', async () => {
    await expect(originRecord(ctx(), { kind: 'comment' as never, ref: 'a', ip: null })).rejects.toThrow()
  })

  it('needs a signed-in member', async () => {
    await expect(originRecord(ctx(null), { kind: 'post', ref: 'a', ip: null })).rejects.toBeInstanceOf(AuthorizationError)
    expect(query).not.toHaveBeenCalled()
  })

  it('writes nothing else', async () => {
    await originRecord(ctx(), { kind: 'post', ref: 'a', ip: '203.0.113.7' })
    expect(query).toHaveBeenCalledTimes(1)
  })
})
