// #909 — member.search_sharing.set: the switch on You. Off means this member's searches are never counted.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { memberSearchSharingSet } from './search-sharing-set'

const ME = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  query.mockReset()
  query.mockResolvedValue({ rows: [], rowCount: 1 })
})

describe('member.search_sharing.set', () => {
  it("writes the member's own row only", async () => {
    expect(await memberSearchSharingSet({ actingMemberId: ME } as never, { on: false })).toEqual({ on: false })
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/update public\.members\s+set search_sharing = \$1\s+where id = \$2/i)
    expect(params).toEqual([false, ME])
  })

  it('needs a signed-in member', async () => {
    await expect(memberSearchSharingSet({ actingMemberId: 'self-bootstrap' } as never, { on: true })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses anything but a boolean', async () => {
    await expect(memberSearchSharingSet({ actingMemberId: ME } as never, { on: 'yes' })).rejects.toThrow()
  })
})
