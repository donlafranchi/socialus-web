// #287 — tags are moderated after they appear, against a list that marks each
// one safe, unsafe or needs review (Don, 2026-10-01).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }),
}))

import { tagReview } from './review'
import type { ActionContext } from '../_lib/context'

const OPERATOR = '11111111-1111-1111-1111-111111111111'
const MEMBER = '22222222-2222-2222-2222-222222222222'
const TAG = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-01T12:00:00Z')

const ctx = (actingMemberId: string): ActionContext =>
  ({ actingMemberId, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }) as ActionContext

beforeEach(() => {
  process.env.OPERATOR_MEMBER_ID = OPERATOR
  query.mockReset()
  query.mockResolvedValue({ rows: [{ id: TAG }], rowCount: 1 })
})

describe('#287 — reviewing a tag', () => {
  it('unsafe hides it everywhere, keeping its rows so the call can be undone', async () => {
    await tagReview(ctx(OPERATOR), { tagId: TAG, verdict: 'unsafe' })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/update public\.tags/)
    expect(sql).not.toMatch(/delete/)
    expect(params).toEqual(expect.arrayContaining([TAG, 'unsafe', 'hidden', OPERATOR, NOW]))
  })

  it('safe keeps it showing, or shows it again', async () => {
    await tagReview(ctx(OPERATOR), { tagId: TAG, verdict: 'safe' })
    const [, params] = query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(expect.arrayContaining([TAG, 'safe', 'visible']))
  })

  it('only the operator may review', async () => {
    await expect(tagReview(ctx(MEMBER), { tagId: TAG, verdict: 'unsafe' })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('a tag that does not exist is not found', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    await expect(tagReview(ctx(OPERATOR), { tagId: TAG, verdict: 'safe' })).rejects.toThrow(/not found/)
  })

  it('there is no third verdict an operator can set — needs review is where a tag starts', async () => {
    await expect(tagReview(ctx(OPERATOR), { tagId: TAG, verdict: 'needs_review' as never })).rejects.toThrow()
  })
})
