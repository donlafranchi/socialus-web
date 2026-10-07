// #222 (F081) — member.signup_profile.set: what signup collects, written to the
// acting member's own row in one statement.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { memberSignupProfileSet } from './signup-profile-set'
import { NotFoundError } from '../_lib/errors'

const ME = '11111111-1111-1111-1111-111111111111'
const METRO = '22222222-2222-2222-2222-222222222222'
const ctx = { actingMemberId: ME } as never
const input = { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true as const, metroId: METRO }

beforeEach(() => query.mockReset())

describe('memberSignupProfileSet', () => {
  it("writes the acting member's own row, with the metro the zip decided", async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: ME }] })
    await expect(memberSignupProfileSet(ctx, input)).resolves.toEqual({ memberId: ME, metroId: METRO })
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/update public\.members/)
    expect(sql).toMatch(/adult_confirmed_at = now\(\)/)
    expect(params).toEqual(['Maya Rivera', 'Maya', '95819', METRO, ME])
  })

  it('a zip with no metro leaves home_metro_id empty rather than guessing', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: ME }] })
    await expect(memberSignupProfileSet(ctx, { ...input, metroId: null })).resolves.toEqual({ memberId: ME, metroId: null })
    expect(query.mock.calls[0]![1]).toEqual(['Maya Rivera', 'Maya', '95819', null, ME])
  })

  it('refuses without the 18+ confirmation', async () => {
    await expect(memberSignupProfileSet(ctx, { ...input, adultConfirmed: false as never })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('refuses a malformed zip', async () => {
    await expect(memberSignupProfileSet(ctx, { ...input, zip: '958' })).rejects.toThrow()
  })

  it('says so when there is no member row to write', async () => {
    query.mockResolvedValue({ rowCount: 0, rows: [] })
    await expect(memberSignupProfileSet(ctx, input)).rejects.toBeInstanceOf(NotFoundError)
  })
})
