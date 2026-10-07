// #329/#330 — member.default_metro.set: a member's own default metro.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { memberDefaultMetroSet } from './default-metro-set'
import { NotFoundError } from '../_lib/errors'

const ME = '11111111-1111-1111-1111-111111111111'
const METRO = '22222222-2222-2222-2222-222222222222'
const ctx = { actingMemberId: ME } as never

beforeEach(() => query.mockReset())

describe('memberDefaultMetroSet', () => {
  it("writes the acting member's own row, and only for a metro that is open", async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ slug: 'pdx' }] })
    await expect(memberDefaultMetroSet(ctx, { metroId: METRO })).resolves.toEqual({ memberId: ME, metroId: METRO, slug: 'pdx' })
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/update public\.members/)
    expect(sql).toMatch(/is_open/)
    expect(params).toEqual([METRO, ME])
  })

  it('refuses a metro that is not open or does not exist', async () => {
    query.mockResolvedValue({ rowCount: 0, rows: [] })
    await expect(memberDefaultMetroSet(ctx, { metroId: METRO })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rejects anything that is not a uuid', async () => {
    await expect(memberDefaultMetroSet(ctx, { metroId: 'pdx' })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})
