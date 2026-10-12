// #695 / #568 (F081.4, F103.5) — member.zip.set: a member who moves changes their zip on /you, and their market and
// home town follow it. Not one-and-done.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const query = vi.fn()
vi.mock('../_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }))

import { memberZipSet } from './zip-set'
import { NotFoundError, ValidationError } from '../_lib/errors'

const ME = '11111111-1111-1111-1111-111111111111'
const METRO = '22222222-2222-2222-2222-222222222222'
const ctx = { actingMemberId: ME } as never

const resolves = (row: Record<string, unknown> | null, updated = 1) =>
  query.mockImplementation(async (sql: string) => {
    if (/zip_home/i.test(sql) && /^\s*select/i.test(sql)) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
    if (/update public\.members/i.test(sql)) return { rows: [], rowCount: updated }
    throw new Error('unexpected: ' + sql)
  })
const SAC = { market_key: 'sacramento', town_geoid: '0630693', town_name: 'Granite Bay', market_name: 'Sacramento', is_open: true, metro_id: METRO }
const YUBA = { market_key: 'county-06115', town_geoid: null, town_name: null, market_name: 'Yuba County, CA', is_open: null, metro_id: null }

beforeEach(() => {
  query.mockReset()
})

describe('memberZipSet', () => {
  // [guards F081.4 partial: changing the zip re-resolves the market and the home town]
  it('writes the new zip with the market, the home town and the home metro it decides', async () => {
    resolves(SAC)
    const out = await memberZipSet(ctx, { zip: '95746' })
    expect(out).toEqual({ marketKey: 'sacramento', marketName: 'Sacramento', open: true, homeTown: 'Granite Bay' })
    const [sql, params] = query.mock.calls.find(([s]) => /update public\.members/i.test(s))!
    expect(sql).toMatch(/zip = \$1/)
    expect(params).toEqual(['95746', 'sacramento', 'Granite Bay', '0630693', METRO, ME])
  })

  // [guards F103.5 partial: a member who moves to a waiting market has no home town and no home metro until it opens]
  it('a waiting market is named, with no home town and no home metro', async () => {
    resolves(YUBA)
    const out = await memberZipSet(ctx, { zip: '95901' })
    expect(out).toEqual({ marketKey: 'county-06115', marketName: 'Yuba County, CA', open: false, homeTown: null })
    expect(query.mock.calls.find(([s]) => /update public\.members/i.test(s))![1]).toEqual(['95901', 'county-06115', null, null, null, ME])
  })

  // [guards F103.2 partial: an unknown zip is refused with the exact words and nothing is written]
  it('refuses a zip nobody knows, with the exact words', async () => {
    resolves(null)
    await expect(memberZipSet(ctx, { zip: '00000' })).rejects.toThrow("We don't recognize that zip, try again.")
    await expect(memberZipSet(ctx, { zip: '00000' })).rejects.toBeInstanceOf(ValidationError)
    expect(query.mock.calls.some(([s]) => /update public\.members/i.test(s))).toBe(false)
  })

  it('refuses a malformed zip before reading anything', async () => {
    await expect(memberZipSet(ctx, { zip: '958' })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('needs a signed-in member', async () => {
    await expect(memberZipSet({ actingMemberId: null } as never, { zip: '95746' })).rejects.toThrow()
    await expect(memberZipSet({ actingMemberId: 'self-bootstrap' } as never, { zip: '95746' })).rejects.toThrow()
  })

  it('says so when there is no member row to write', async () => {
    resolves(SAC, 0)
    await expect(memberZipSet(ctx, { zip: '95746' })).rejects.toBeInstanceOf(NotFoundError)
  })
})
