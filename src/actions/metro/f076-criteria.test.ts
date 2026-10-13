import { describe, it, expect, vi, beforeEach } from 'vitest'

// F076 criteria that hold for BOTH ways of joining (signed in, and an address
// with no account). The per-handler files test each path alone; a criterion
// about "a person" is only guarded when it fails if either path breaks.

type QueryCall = [string, unknown[]?]

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

import { metroWaitlistJoin } from './waitlist-join'
import { metroWaitlistJoinAnonymous } from './waitlist-join-anonymous'
import { metroStanding } from '@/lib/metro/waitlist-standing'
import type { ActionContext } from '../_lib/context'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const BOISE = '22222222-2222-2222-2222-222222222222'
const RENO = '33333333-3333-3333-3333-333333333333'
const EMAIL = 'pat@example.org'

const ctx = (): ActionContext =>
  ({
    actingMemberId: MEMBER,
    viaDelegationId: null,
    traceId: 't',
    db: {} as never,
    now: () => new Date('2026-10-12T12:00:00Z'),
  }) as ActionContext

const calls = (re: RegExp): QueryCall[] => (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

function route(existing: { metro_id: string; role: string } | null) {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from auth\.users/i.test(sql) && !/metro_waitlist/i.test(sql)) return { rows: [] }
    if (/from public\.metro_waitlist/i.test(sql) && /member_id is null/i.test(sql)) return { rows: [] }
    if (/from public\.metro_polygons/i.test(sql) && /select/i.test(sql)) {
      return { rows: [{ id: BOISE, name: 'Boise', is_open: false }] }
    }
    if (/from public\.metro_waitlist/i.test(sql) && /select/i.test(sql)) {
      return { rows: existing ? [{ id: 'w1', ...existing }] : [] }
    }
    return { rows: [{ id: 'w1' }] }
  })
}

const paths = {
  'signed in': (metroId: string, role: 'creator' | 'patron') => metroWaitlistJoin(ctx(), { metroId, role }),
  'an address with no account': (metroId: string, role: 'creator' | 'patron') =>
    metroWaitlistJoinAnonymous(ctx(), { metroId, email: EMAIL, role }),
} as const

const counterWrites = () =>
  calls(/update public\.metro_polygons/i).map(([sql, params]) => ({
    column: /creator_count/.test(sql) ? 'creator' : 'patron',
    delta: /greatest/i.test(sql) ? -1 : 1,
    metro: (params ?? [])[0],
  }))

describe.each(Object.entries(paths))('F076 — joining %s', (_name, join) => {
  // [guards F076.5]
  it('changing metro takes the count off the old metro and puts it on the new one, nothing else', async () => {
    route({ metro_id: RENO, role: 'creator' })
    await join(BOISE, 'creator')
    expect(counterWrites()).toEqual([
      { column: 'creator', delta: -1, metro: RENO },
      { column: 'creator', delta: 1, metro: BOISE },
    ])
  })

  // [guards F076.6]
  it('a creator and a patron are counted in separate columns, each only in its own, and stay readable beside the one displayed number', async () => {
    route(null)
    await join(BOISE, 'creator')
    expect(counterWrites()).toEqual([{ column: 'creator', delta: 1, metro: BOISE }])
    route(null)
    await join(BOISE, 'patron')
    expect(counterWrites()).toEqual([{ column: 'patron', delta: 1, metro: BOISE }])
    const s = metroStanding({ creatorCount: 12, patronCount: 30, creatorThreshold: 50, patronThreshold: 250 })
    expect([s.creatorCount, s.patronCount]).toEqual([12, 30])
    expect(s.display).toEqual({ combined: 42, target: 300 })
  })

  it('a move between roles on one metro takes one off one column and adds one to the other', async () => {
    route({ metro_id: BOISE, role: 'patron' })
    await join(BOISE, 'creator')
    expect(counterWrites()).toEqual([
      { column: 'patron', delta: -1, metro: BOISE },
      { column: 'creator', delta: 1, metro: BOISE },
    ])
  })
})
