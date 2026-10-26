import { describe, it, expect, vi, beforeEach } from 'vitest'

// F118 criterion 4 — a supporter adds a maker they love: it becomes an unclaimed Page, a Page
// already there is offered instead of a second one, and each member may add 10 a day.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn(async () => undefined),
}))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { townMakerAdd, DAILY_ADDS } from './maker-add'
import { ConflictError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

const MEMBER = '22222222-2222-2222-2222-222222222222'
const ctx = (): ActionContext => ({ actingMemberId: MEMBER, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date('2026-10-26T12:00:00Z') })
const calls = (re: RegExp) => (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))
const input = (o: Record<string, unknown> = {}) => ({ townSlug: 'solano', place: 'Vacaville', name: 'Bluebird Bakery', link: 'bluebirdbakery.com', kind: 'food', ...o })

function install(o: { town?: boolean; added?: number; existing?: { public_id: string; name: string } | null } = {}) {
  const { town = true, added = 0, existing = null } = o
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] }
    if (/from public\.towns/i.test(sql)) return { rows: town ? [{ slug: 'solano', county_names: ['Solano'], place_names: ['Dixon', 'Vacaville'] }] : [] }
    if (/from public\.town_adds/i.test(sql)) return { rows: [{ n: String(added) }] }
    if (/from public\.groups g/i.test(sql)) return { rows: existing ? [existing] : [] }
    if (/from public\.places/i.test(sql)) return { rows: [{ id: 'place-1', display_name: 'Vacaville' }] }
    if (/from public\.locations/i.test(sql)) return { rows: [] }
    if (/insert into public\.locations/i.test(sql)) return { rows: [{ id: 'loc-1' }] }
    if (/insert into public\.groups/i.test(sql)) return { rows: [{ id: 'g-1', public_id: 'abc123' }] }
    if (/insert into public\.(group_businesses|page_sources|town_adds)/i.test(sql)) return { rows: [] }
    throw new Error('unexpected: ' + sql)
  })
}

beforeEach(() => appendEvent.mockClear())

describe('town.maker_add', () => {
  it('makes an unclaimed Page owned by the system member, on its own site, and credits the adder', async () => {
    install()
    const r = await townMakerAdd(ctx(), input())
    expect(r).toEqual({ kind: 'added', publicId: 'abc123' })
    const g = calls(/insert into public\.groups/i)[0]![1]!
    expect(g).toContain(SYSTEM_MEMBER_ID)
    expect(g).toContain('https://bluebirdbakery.com')
    expect(g).toContain('Bluebird Bakery')
    expect(calls(/insert into public\.groups/i)[0]![0]).toMatch(/unclaimed_at/)
    const add = calls(/insert into public\.town_adds/i)[0]![1]!
    expect(add).toEqual(expect.arrayContaining([MEMBER, 'g-1', 'solano', 'food']))
    expect(calls(/insert into public\.page_sources/i)[0]![1]).toContain('website')
    expect(appendEvent).toHaveBeenCalledOnce()
    // The event is written inside the transaction, as an existing kind.
    const [evCtx, , row] = appendEvent.mock.calls[0] as unknown as [{ db: unknown }, string, { event_kind: string }]
    expect(evCtx.db).toHaveProperty('query')
    expect(row.event_kind).toBe('group.created')
  })

  it('takes the member lock before counting, so parallel adds can’t pass the limit', async () => {
    install()
    await townMakerAdd(ctx(), input())
    const sqls = (query.mock.calls as QueryCall[]).map(([q]) => q)
    expect(sqls.findIndex((q) => /pg_advisory_xact_lock/.test(q))).toBeLessThan(sqls.findIndex((q) => /from public\.town_adds/.test(q)))
  })

  it('only offers a listed Page, and matches the site however it was typed', async () => {
    install()
    await townMakerAdd(ctx(), input())
    const dedupe = calls(/from public\.groups g/i)[0]![0]
    expect(dedupe).toMatch(/discoverability = 'listed'/)
    expect(dedupe).toMatch(/regexp_replace/)
  })

  it('records a social profile as the social source', async () => {
    install()
    await townMakerAdd(ctx(), input({ link: 'https://instagram.com/bluebird' }))
    expect(calls(/insert into public\.page_sources/i)[0]![1]).toContain('social')
  })

  it('offers the Page that is already there instead of making a second', async () => {
    install({ existing: { public_id: 'zzz999', name: 'Bluebird Bakery' } })
    const r = await townMakerAdd(ctx(), input())
    expect(r).toEqual({ kind: 'exists', publicId: 'zzz999' })
    expect(calls(/insert into/i)).toHaveLength(0)
  })

  it(`refuses an eleventh add in a day (limit ${DAILY_ADDS})`, async () => {
    install({ added: DAILY_ADDS })
    await expect(townMakerAdd(ctx(), input())).rejects.toBeInstanceOf(ConflictError)
    expect(calls(/insert into/i)).toHaveLength(0)
  })

  it('refuses a link that is not the maker’s own', async () => {
    install()
    await expect(townMakerAdd(ctx(), input({ link: 'https://www.yelp.com/biz/bluebird' }))).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a town that is not on the list', async () => {
    install({ town: false })
    await expect(townMakerAdd(ctx(), input())).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses a town inside it that the town does not list', async () => {
    install()
    await expect(townMakerAdd(ctx(), input({ place: 'Boise' }))).rejects.toBeInstanceOf(ValidationError)
  })

  it('needs a kind from the five', async () => {
    install()
    await expect(townMakerAdd(ctx(), input({ kind: 'casino' }))).rejects.toBeInstanceOf(ValidationError)
  })
})
