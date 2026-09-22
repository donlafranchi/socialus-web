import { describe, it, expect, vi, beforeEach } from 'vitest'

// T167 (#193) — metro.waitlist_join_anonymous.
//
// F076 criteria 13-15, amended 2026-09-21. The criteria each test holds:
//   c4  idempotent — one address counts once, whatever it does next
//   c5  changing metro MOVES the count, stranding and duplicating neither
//   c13 no account, no password, no second step
//   c14 the response cannot distinguish "inserted" from "already there"
//   c12 nothing here ever opens a metro
//
// The c14 tests are the reason this handler exists rather than a branch in
// metro.waitlist_join, and they are the ones to distrust a "harmless" edit to.

type QueryCall = [string, unknown[]?]

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))

import { metroWaitlistJoinAnonymous } from './waitlist-join-anonymous'
import type { ActionContext } from '../_lib/context'

const BOISE = '22222222-2222-2222-2222-222222222222'
const RENO = '33333333-3333-3333-3333-333333333333'

// The identity this handler must never reach for. Reading it is the bug.
function ctx(): ActionContext {
  return {
    get actingMemberId(): never {
      throw new Error('anonymous context: actingMemberId must not be read')
    },
    viaDelegationId: null,
    traceId: 'trace-1',
    db: {} as never,
    now: () => new Date('2026-09-22T12:00:00Z'),
  } as unknown as ActionContext
}

const calls = (re: RegExp): QueryCall[] =>
  (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

interface RouterOpts {
  existing?: { id: string; metro_id: string; role: string } | null
  metroExists?: boolean
  isOpen?: boolean
  creatorCount?: number
  patronCount?: number
}

function installRouter(opts: RouterOpts = {}) {
  const {
    existing = null,
    metroExists = true,
    isOpen = false,
    creatorCount = 7,
    patronCount = 11,
  } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.metro_polygons/i.test(sql) && /select/i.test(sql)) {
      return {
        rows: metroExists
          ? [
              {
                id: BOISE,
                name: 'Boise',
                is_open: isOpen,
                creator_count: creatorCount,
                patron_count: patronCount,
                creator_threshold: 50,
                patron_threshold: 250,
              },
            ]
          : [],
      }
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

beforeEach(() => installRouter())

describe('metro.waitlist_join_anonymous — leaving an address', () => {
  it('records the address, the metro and the role, with no member', async () => {
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'someone@example.com',
      role: 'creator',
    })
    const [insert] = calls(/insert into public\.metro_waitlist/i)
    expect(insert).toBeDefined()
    expect(insert![1]).toEqual(expect.arrayContaining([BOISE, 'someone@example.com', 'creator']))
    // c13: no account. A member id has no business in this row, and the
    // one-identity CHECK would reject it anyway.
    expect(insert![0]).not.toMatch(/member_id/i)
  })

  it('never reads the acting member — there is not one', async () => {
    // ctx() throws on actingMemberId. A handler that reaches for it fails here
    // rather than in production against a signed-out stranger.
    await expect(
      metroWaitlistJoinAnonymous(ctx(), {
        metroId: BOISE,
        email: 'someone@example.com',
        role: 'patron',
      }),
    ).resolves.toBeTruthy()
  })

  it('normalises the address before it reaches SQL', async () => {
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: '  Foo@Example.COM ',
      role: 'patron',
    })
    const [insert] = calls(/insert into public\.metro_waitlist/i)
    expect(insert![1]).toEqual(expect.arrayContaining(['foo@example.com']))
  })

  it('refuses something that is not an address, and writes nothing', async () => {
    for (const email of ['', 'nope', 'a@b', 'two words@x.com', 'a@@b.com']) {
      await expect(
        metroWaitlistJoinAnonymous(ctx(), { metroId: BOISE, email, role: 'patron' }),
      ).rejects.toBeTruthy()
    }
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
  })

  it('refuses a role that is neither creator nor patron, and does not default one', async () => {
    await expect(
      metroWaitlistJoinAnonymous(ctx(), { metroId: BOISE, email: 'a@b.com', role: 'lurker' }),
    ).rejects.toBeTruthy()
    await expect(
      metroWaitlistJoinAnonymous(ctx(), { metroId: BOISE, email: 'a@b.com' }),
    ).rejects.toBeTruthy()
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
  })
})

describe('metro.waitlist_join_anonymous — criterion 14, ruled 2026-09-22 (#196)', () => {
  // The ruling is "no count", and these two tests are what makes it structural
  // rather than a habit. An earlier version of this file asserted that two
  // submissions returned identical results; it passed against the mock and was
  // false against Postgres, because the mock returns a fixed count however it
  // is called. Asserting the ABSENCE of the read cannot fail that way.
  it('never selects the counts at all, so there is no read order to get wrong', async () => {
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'new@example.com',
      role: 'creator',
    })
    const reads = (query.mock.calls as QueryCall[]).filter(([sql]) => /^\s*select/i.test(sql))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.filter(([sql]) => /creator_count|patron_count|_threshold/i.test(sql))).toHaveLength(0)
  })

  it('returns no count, under any name', async () => {
    const result = await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'new@example.com',
      role: 'creator',
    })
    expect(Object.keys(result).sort()).toEqual(['metroId', 'metroName', 'open'])
    expect(JSON.stringify(result)).not.toMatch(/count|threshold|combined|remaining/i)
  })

  it('still maintains the counters — a write is not a read', async () => {
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'new@example.com',
      role: 'creator',
    })
    const bumps = calls(/update public\.metro_polygons/i)
    expect(bumps).toHaveLength(1)
    expect(bumps[0]![0]).toMatch(/creator_count/i)
  })

  // Now true in full, and true against Postgres too: with no count in the
  // result there is nothing left that could differ between the two.
  it('returns a byte-identical result whether the address was new or known', async () => {
    installRouter({ existing: null })
    const fresh = await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'same@example.com',
      role: 'creator',
    })

    installRouter({ existing: { id: 'w1', metro_id: BOISE, role: 'creator' } })
    const repeat = await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'same@example.com',
      role: 'creator',
    })

    expect(repeat).toEqual(fresh)
  })

  it('carries no flag that would let a caller tell the two apart', async () => {
    const result = await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'new@example.com',
      role: 'creator',
    })
    for (const leak of ['changed', 'created', 'existed', 'inserted', 'alreadyListed', 'isNew', 'creatorCount', 'patronCount']) {
      expect(result).not.toHaveProperty(leak)
    }
  })
})

describe('metro.waitlist_join_anonymous — idempotence and moving', () => {
  it('writes nothing at all when the address is already here in this role', async () => {
    installRouter({ existing: { id: 'w1', metro_id: BOISE, role: 'creator' } })
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'same@example.com',
      role: 'creator',
    })
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
    expect(calls(/update public\.metro_waitlist/i)).toHaveLength(0)
    expect(calls(/update public\.metro_polygons/i)).toHaveLength(0)
  })

  it('moves the row and both counts when the same address names another metro', async () => {
    installRouter({ existing: { id: 'w1', metro_id: RENO, role: 'patron' } })
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'same@example.com',
      role: 'patron',
    })
    // One row, moved — not a second one. The unique index on lower(email) is
    // global, so a second row is not merely wrong, it is impossible.
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
    expect(calls(/update public\.metro_waitlist/i)).toHaveLength(1)

    const bumps = calls(/update public\.metro_polygons/i)
    expect(bumps).toHaveLength(2)
    const down = bumps.find(([sql]) => /greatest/i.test(sql))
    const up = bumps.find(([sql]) => !/greatest/i.test(sql))
    expect(down![1]).toEqual(expect.arrayContaining([RENO]))
    expect(up![1]).toEqual(expect.arrayContaining([BOISE]))
  })

  it('moves the count between roles when the role changes on the same metro', async () => {
    installRouter({ existing: { id: 'w1', metro_id: BOISE, role: 'patron' } })
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'same@example.com',
      role: 'creator',
    })
    const bumps = calls(/update public\.metro_polygons/i)
    expect(bumps).toHaveLength(2)
    expect(bumps.some(([sql]) => /patron_count/i.test(sql) && /greatest/i.test(sql))).toBe(true)
    expect(bumps.some(([sql]) => /creator_count/i.test(sql) && !/greatest/i.test(sql))).toBe(true)
  })
})

describe('metro.waitlist_join_anonymous — the edges it must not cross', () => {
  it('writes no row for a metro that is already open', async () => {
    installRouter({ isOpen: true })
    const result = await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'a@b.com',
      role: 'creator',
    })
    expect(result.open).toBe(true)
    expect(calls(/insert into public\.metro_waitlist/i)).toHaveLength(0)
    expect(calls(/update public\.metro_polygons/i)).toHaveLength(0)
  })

  it('refuses a metro that does not exist', async () => {
    installRouter({ metroExists: false })
    await expect(
      metroWaitlistJoinAnonymous(ctx(), { metroId: BOISE, email: 'a@b.com', role: 'creator' }),
    ).rejects.toBeTruthy()
  })

  // c12 — crossing a threshold makes a metro eligible; opening it is an act by
  // a person. Nothing in this handler may write is_open.
  it('never opens a metro, even at the threshold', async () => {
    installRouter({ creatorCount: 50, patronCount: 250 })
    await metroWaitlistJoinAnonymous(ctx(), {
      metroId: BOISE,
      email: 'a@b.com',
      role: 'creator',
    })
    // The metro SELECT reads is_open, which is fine and necessary. The rule is
    // that nothing WRITES it.
    const writes = (query.mock.calls as QueryCall[]).filter(([sql]) =>
      /^\s*(insert|update)/i.test(sql),
    )
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.filter(([sql]) => /is_open/i.test(sql))).toHaveLength(0)
  })
})
