import { describe, it, expect, vi, beforeEach } from 'vitest'

// T163 (#77) — metro.waitlist_join.
//
// The scenario's hard edges, and which test holds each:
//   c3  exactly one of creator|patron, neither defaulted
//   c4  idempotent — re-joining increments nothing
//   c5  changing metro MOVES the count, stranding and duplicating neither
//   c6  the two counts are maintained separately
//   c10 eligibility is gated on creators, not on the combined 300
//   c12 nothing here ever opens a metro

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn(async () => undefined),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { metroWaitlistJoin } from './waitlist-join'
import { AuthorizationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const BOISE = '22222222-2222-2222-2222-222222222222'
const RENO = '33333333-3333-3333-3333-333333333333'

function ctx(actingMemberId: string = MEMBER): ActionContext {
  return {
    actingMemberId,
    viaDelegationId: null,
    traceId: 'trace-1',
    db: {} as never,
    now: () => new Date('2026-09-14T12:00:00Z'),
  }
}

const calls = (re: RegExp): QueryCall[] =>
  (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

function installRouter(
  opts: { existing?: { metro_id: string; role: string } | null; metroExists?: boolean } = {},
) {
  const { existing = null, metroExists = true } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.metro_polygons/i.test(sql) && /select/i.test(sql)) {
      return { rows: metroExists ? [{ id: BOISE, is_open: false }] : [] }
    }
    if (/from public\.metro_waitlist/i.test(sql) && /select/i.test(sql)) {
      return { rows: existing ? [existing] : [] }
    }
    if (/insert into public\.metro_waitlist/i.test(sql)) return { rows: [{ id: 'w1' }] }
    if (/update public\.metro_waitlist/i.test(sql)) return { rows: [{ id: 'w1' }] }
    if (/update public\.metro_polygons/i.test(sql)) return { rows: [{ id: BOISE }] }
    throw new Error(`unexpected query: ${sql}`)
  })
}

beforeEach(() => appendEvent.mockClear())

describe('metro.waitlist_join — joining', () => {
  it('records the member, the metro and the role', async () => {
    installRouter()
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    const [insert] = calls(/insert into public\.metro_waitlist/i)
    expect(insert).toBeDefined()
    expect(insert![1]).toEqual(expect.arrayContaining([MEMBER, BOISE, 'creator']))
  })

  it('refuses a role that is neither creator nor patron', async () => {
    installRouter()
    // The handler takes `unknown` at its boundary — the Zod schema is what
    // rejects this, not the type system, which is exactly the point of
    // asserting it at runtime.
    await expect(
      metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'lurker' }),
    ).rejects.toBeTruthy()
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
  })

  it('refuses a missing role rather than defaulting one', async () => {
    installRouter()
    await expect(metroWaitlistJoin(ctx(), { metroId: BOISE })).rejects.toBeTruthy()
  })

  it('requires a signed-in member', async () => {
    installRouter()
    await expect(
      metroWaitlistJoin(ctx('self-bootstrap'), { metroId: BOISE, role: 'patron' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses a metro that does not exist', async () => {
    installRouter({ metroExists: false })
    await expect(
      metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'patron' }),
    ).rejects.toBeTruthy()
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
  })

  it('increments the creator count, and not the patron count', async () => {
    installRouter()
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    const [bump] = calls(/update public\.metro_polygons/i)
    expect(bump![0]).toMatch(/creator_count/)
    expect(bump![0]).not.toMatch(/patron_count\s*=\s*patron_count\s*\+/)
  })
})

describe('metro.waitlist_join — idempotent by construction (c4)', () => {
  it('re-joining the same metro in the same role writes no second row', async () => {
    installRouter({ existing: { metro_id: BOISE, role: 'creator' } })
    const result = await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
    expect(result.changed).toBe(false)
  })

  it('re-joining the same metro in the same role increments nothing', async () => {
    installRouter({ existing: { metro_id: BOISE, role: 'creator' } })
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    expect(calls(/update public\.metro_polygons/i)).toHaveLength(0)
  })
})

describe('metro.waitlist_join — changing metro moves the count (c5)', () => {
  it('updates the existing row rather than inserting a second', async () => {
    installRouter({ existing: { metro_id: BOISE, role: 'creator' } })
    await metroWaitlistJoin(ctx(), { metroId: RENO, role: 'creator' })
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
    expect(calls(/update public\.metro_waitlist/i)).toHaveLength(1)
  })

  it('decrements the old metro and increments the new one', async () => {
    installRouter({ existing: { metro_id: BOISE, role: 'creator' } })
    await metroWaitlistJoin(ctx(), { metroId: RENO, role: 'creator' })
    const bumps = calls(/update public\.metro_polygons/i)
    const params = bumps.flatMap((c) => (c[1] ?? []) as unknown[])
    expect(params).toContain(BOISE)
    expect(params).toContain(RENO)
    expect(bumps.some(([sql]) => /-\s*1/.test(sql))).toBe(true)
    expect(bumps.some(([sql]) => /\+\s*1/.test(sql))).toBe(true)
  })

  it('moves between roles on the same metro without touching the other metro', async () => {
    installRouter({ existing: { metro_id: BOISE, role: 'patron' } })
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    const bumps = calls(/update public\.metro_polygons/i)
    expect(bumps.length).toBeGreaterThan(0)
    const sql = bumps.map((b) => b[0]).join(' ')
    expect(sql).toMatch(/creator_count/)
    expect(sql).toMatch(/patron_count/)
  })
})

describe('metro.waitlist_join — never opens a metro (c12)', () => {
  it('writes nothing to is_open, whatever the counts', async () => {
    installRouter()
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    const all = (query.mock.calls as QueryCall[]).map(([s]) => s).join('\n')
    expect(all).not.toMatch(/is_open\s*=/)
  })
})

describe('#280 — a builder never moves a metro count', () => {
  it('guards every counter update on the member not being a builder', async () => {
    installRouter({ existing: { metro_id: 'old-metro', role: 'patron' } })
    await metroWaitlistJoin(ctx(), { metroId: BOISE, role: 'creator' })
    const bumps = calls(/update public\.metro_polygons/i)
    expect(bumps.length).toBeGreaterThan(0)
    for (const [sql, params] of bumps) {
      expect(sql).toMatch(/not public\.is_builder\(\$3\)/)
      expect(params?.[2]).toBe(MEMBER)
    }
  })
})
