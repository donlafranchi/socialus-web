import { describe, it, expect, vi, beforeEach } from 'vitest'

// #1299 — metro.waitlist_journey_join: F076.4, .5, .12, .13, .14, .17.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))

import { metroWaitlistJourneyJoin } from './waitlist-journey-join'
import type { ActionContext } from '../_lib/context'

const SAC = '11111111-1111-1111-1111-111111111111'
const TAHOE = '22222222-2222-2222-2222-222222222222'

function ctx(): ActionContext {
  return {
    get actingMemberId(): never {
      throw new Error('anonymous context')
    },
    viaDelegationId: null,
    traceId: 't',
    db: {} as never,
    now: () => new Date('2026-11-13T12:00:00Z'),
  } as unknown as ActionContext
}

function db(market: { metro_id: string; name: string } | null, existing: { id: string; metro_id: string; role: string } | null) {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('zip_market_key')) return { rows: market ? [market] : [] }
    if (sql.includes('from public.metro_waitlist')) return { rows: existing ? [existing] : [] }
    return { rows: [] }
  })
}
const sqls = () => query.mock.calls.map((c) => String(c[0]))

describe('metro.waitlist_journey_join', () => {
  beforeEach(() => db({ metro_id: SAC, name: 'Sacramento' }, null))

  it('joins the zip’s market even when that market is marked open (every zip waits while closed)', async () => {
    const r = await metroWaitlistJourneyJoin(ctx(), { zip: '95814', email: ' A@B.co ', side: 'patron' })
    expect(r).toEqual({ metroId: SAC, marketName: 'Sacramento' })
    expect(sqls().some((s) => s.includes('insert into public.metro_waitlist'))).toBe(true)
    expect(query.mock.calls.find((c) => String(c[0]).includes('insert'))?.[1]).toContain('a@b.co')
    expect(sqls().some((s) => s.includes('patron_count = patron_count + 1'))).toBe(true)
  })

  it('a second join in the same place and side writes nothing and answers the same', async () => {
    db({ metro_id: SAC, name: 'Sacramento' }, { id: 'w1', metro_id: SAC, role: 'patron' })
    const r = await metroWaitlistJourneyJoin(ctx(), { zip: '95814', email: 'a@b.co', side: 'patron' })
    expect(r).toEqual({ metroId: SAC, marketName: 'Sacramento' })
    expect(sqls().some((s) => /insert into|update public\./.test(s))).toBe(false)
  })

  it('a new zip or side moves the count: old down, new up', async () => {
    db({ metro_id: SAC, name: 'Sacramento' }, { id: 'w1', metro_id: TAHOE, role: 'patron' })
    await metroWaitlistJourneyJoin(ctx(), { zip: '95814', email: 'a@b.co', side: 'creator' })
    const s = sqls()
    expect(s.some((x) => x.includes('greatest(patron_count - 1, 0)'))).toBe(true)
    expect(s.some((x) => x.includes('creator_count = creator_count + 1'))).toBe(true)
    expect(s.some((x) => x.includes('insert'))).toBe(false)
  })

  it('refuses a zip with no market', async () => {
    db(null, null)
    await expect(metroWaitlistJourneyJoin(ctx(), { zip: '00000', email: 'a@b.co', side: 'patron' })).rejects.toThrow()
  })

  it('never opens a market and returns no count', async () => {
    const r = await metroWaitlistJourneyJoin(ctx(), { zip: '95814', email: 'a@b.co', side: 'creator' })
    expect(sqls().some((s) => s.includes('is_open'))).toBe(false)
    expect(Object.keys(r).sort()).toEqual(['marketName', 'metroId'])
  })
})
