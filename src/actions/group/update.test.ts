import { describe, it, expect, vi, beforeEach } from 'vitest'

// group.update — the owner edits a live Page.
//
// The two assertions that carry the change: a live Page's SLUG NEVER MOVES on
// rename (an address people have shared is not ours to change), and only the
// managing role may write — which is 'steward' for every non-business kind, so
// an unconditional owner check would lock most founders out of their own Page.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn(async () => undefined),
}))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { groupUpdate } from './update'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const OWNER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '22222222-2222-2222-2222-222222222222'
const GROUP = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-09-18T12:00:00Z')

function ctx(actingMemberId: string | null = OWNER): ActionContext {
  return {
    actingMemberId: actingMemberId as string,
    viaDelegationId: null,
    traceId: 't',
    db: {} as never,
    now: () => NOW,
  }
}

function install(
  opts: { found?: boolean; state?: string; kind?: string; useCase?: string; isManager?: boolean; rowCount?: number } = {},
) {
  const { found = true, state = 'active', kind = 'business', useCase = kind === 'business' ? 'selling' : 'gathering', isManager = true, rowCount = 1 } = opts
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/.test(sql) && /for update/.test(sql)) {
      return { rows: found ? [{ id: GROUP, kind, use_case: useCase, lifecycle_state: state }] : [] }
    }
    if (/from public\.group_memberships/.test(sql)) {
      return { rows: isManager ? [{ role: kind === 'business' ? 'owner' : 'steward' }] : [] }
    }
    if (/update public\.groups/.test(sql)) return { rows: [], rowCount }
    return { rows: [] }
  })
}

const sql = (re: RegExp): QueryCall[] =>
  (query.mock.calls as QueryCall[]).filter(([s]) => re.test(s))

beforeEach(() => {
  query.mockReset()
  appendEvent.mockClear()
})

describe('a live Page keeps its address', () => {
  // verbs.md forbids renaming an active Page's slug: a moved public URL is a
  // broken link somebody already shared. update_draft re-derives the slug on
  // every rename; this must not.
  it('changes the name and never the slug', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, name: 'Oak Park Bakery & Cafe' })
    expect(out.patched).toEqual(['name'])
    const [text] = sql(/update public\.groups/)[0]!
    expect(text).toContain('name = $1')
    expect(text).not.toContain('slug')
  })
})

describe('only the managing role may edit', () => {
  it('refuses a stranger', async () => {
    install({ isManager: false })
    await expect(groupUpdate(ctx(STRANGER), { groupId: GROUP, name: 'x' })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  it('refuses a signed-out caller before touching the row', async () => {
    install()
    await expect(groupUpdate(ctx(null), { groupId: GROUP, name: 'x' })).rejects.toBeInstanceOf(
      AuthorizationError,
    )
  })

  // A non-business founder holds 'steward', never 'owner'.
  it('accepts the steward of a non-business Page', async () => {
    install({ kind: 'group' })
    const out = await groupUpdate(ctx(), { groupId: GROUP, description: 'Tuesdays' })
    expect(out.patched).toEqual(['description'])
    const [, params] = sql(/from public\.group_memberships/)[0]!
    expect(params?.[2]).toBe('steward')
  })
})

describe('which rows are editable', () => {
  it('sends a draft to the other handler by name', async () => {
    install({ state: 'draft' })
    const err = await groupUpdate(ctx(), { groupId: GROUP, name: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.message).toContain('group.update_draft')
  })

  it('refuses a dissolved Page', async () => {
    install({ state: 'dissolved' })
    await expect(groupUpdate(ctx(), { groupId: GROUP, name: 'x' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('reports a missing Page as missing', async () => {
    install({ found: false })
    await expect(groupUpdate(ctx(), { groupId: GROUP, name: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('refuses if the Page stopped being active mid-write', async () => {
    install({ rowCount: 0 })
    await expect(groupUpdate(ctx(), { groupId: GROUP, name: 'x' })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('patching', () => {
  it('writes only what was supplied', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, description: 'New hours' })
    expect(out.patched).toEqual(['description'])
  })

  // `undefined` leaves a field alone; an explicit null clears it. A truthiness
  // check would make "remove my photo" impossible to express.
  it('clears a field on an explicit null', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, photoUrl: null })
    expect(out.patched).toEqual(['photo_url'])
    const [, params] = sql(/update public\.groups/)[0]!
    expect(params?.[0]).toBeNull()
  })

  it('does nothing, and writes nothing, when nothing was supplied', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP })
    expect(out.patched).toEqual([])
    expect(sql(/update public\.groups/)).toHaveLength(0)
    expect(appendEvent).not.toHaveBeenCalled()
  })
})

describe('the edit is recorded', () => {
  // Draft saves emit nothing on purpose. An edit to something people can
  // already see belongs in the Page's history.
  it('writes an event naming the fields that changed', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, name: 'New', description: 'Also new' })
    const call = appendEvent.mock.calls[0] as unknown as [unknown, string, { event_kind: string; payload: Record<string, unknown> }]
    expect(call[2].event_kind).toBe('group.updated')
    expect(call[2].payload.fields).toEqual(['name', 'description'])
    expect(call[2].payload.by).toBe(OWNER)
  })
})

describe('#293 — business phone and opening hours', () => {
  it('stores the phone as E.164, however it was typed', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, contactPhone: '(916) 555-0142' })
    expect(out.patched).toContain('contact_phone')
    const [text, params] = sql(/update public\.groups/)[0]!
    expect(text).toMatch(/contact_phone = \$1/)
    expect(params![0]).toBe('+19165550142')
  })

  it('null clears the phone', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, contactPhone: null })
    expect(sql(/update public\.groups/)[0]![1]![0]).toBeNull()
  })

  it('refuses a number that is not a US phone, writing nothing', async () => {
    install()
    await expect(groupUpdate(ctx(), { groupId: GROUP, contactPhone: '555-0142' })).rejects.toThrow(/phone/i)
    expect(sql(/update public\.groups/)).toHaveLength(0)
  })

  it('stores valid hours, and refuses a close before its open', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, openingHours: { mon: [{ open: '07:00', close: '15:00' }] } })
    expect(sql(/update public\.groups/)[0]![1]![0]).toBe(JSON.stringify({ mon: [{ open: '07:00', close: '15:00' }] }))
    install()
    await expect(
      groupUpdate(ctx(), { groupId: GROUP, openingHours: { mon: [{ open: '15:00', close: '07:00' }] } }),
    ).rejects.toThrow()
  })

  it('the event names the fields, never the number', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, contactPhone: '9165550142' })
    expect(JSON.stringify(appendEvent.mock.calls)).not.toContain('5550142')
  })
})

describe('#285 — tags on a live Page can be edited any time (Don, 2026-10-01)', () => {
  it('replaces the Page\'s tags with the new set, in the same transaction', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, tags: ['Sourdough', 'rye'] })
    expect(out.patched).toContain('tags')
    const upserts = sql(/insert into public\.tags/)
    expect(upserts.map(([, p]) => p![1])).toEqual(['sourdough', 'rye'])
    const [drop] = sql(/delete from public\.page_tags/)
    expect(drop![1]).toEqual([GROUP, ['sourdough', 'rye']])
    expect(sql(/insert into public\.page_tags/)).toHaveLength(2)
  })

  it('treats two spellings of one tag as one', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, tags: ['Sour Dough', 'sour  dough'] })
    expect(sql(/insert into public\.tags/)).toHaveLength(1)
  })

  it('refuses to leave a Page with no tags — search matches tags', async () => {
    install()
    await expect(groupUpdate(ctx(), { groupId: GROUP, tags: [] })).rejects.toThrow()
    await expect(groupUpdate(ctx(), { groupId: GROUP, tags: ['   '] })).rejects.toThrow()
    expect(sql(/delete from public\.page_tags/)).toHaveLength(0)
  })

  it('a stranger cannot change them', async () => {
    install({ isManager: false })
    await expect(groupUpdate(ctx(STRANGER), { groupId: GROUP, tags: ['x'] })).rejects.toThrow()
    expect(sql(/page_tags/)).toHaveLength(0)
  })

  it('tags alone touch no column on the Page', async () => {
    install()
    await groupUpdate(ctx(), { groupId: GROUP, tags: ['bread'] })
    expect(sql(/update public\.groups/)).toHaveLength(0)
    expect(appendEvent).toHaveBeenCalledTimes(1)
  })
})

// Don, 2026-10-04: hours and phone are a component an owner can add to a group.
describe('hours and phone, switched on or off', () => {
  it('records the choice in the Page metadata, touching nothing else', async () => {
    install()
    const out = await groupUpdate(ctx(), { groupId: GROUP, contactComponent: true })
    expect(out.patched).toContain('components')
    const [text, params] = sql(/jsonb_build_object\('contact'/)[0]!
    expect(text).toMatch(/update public\.groups\s+set metadata/)
    expect(params).toEqual([GROUP, true])
  })
})

describe('#363 — the owner changes the type and use case in settings', () => {
  it('a group made a business is stored as business/selling and its stewards become owners', async () => {
    install({ kind: 'group' })
    const res = await groupUpdate(ctx(), { groupId: GROUP, pageKind: 'business' })
    expect(res.patched).toContain('kind')
    expect(sql(/set kind = \$2, use_case = \$3/)[0]![1]).toEqual([GROUP, 'business', 'selling'])
    expect(sql(/update public\.group_memberships set role/)[0]![1]).toEqual([GROUP, 'owner', 'steward'])
  })

  it('choosing the type and use case it already has changes nothing', async () => {
    install({ kind: 'business', useCase: 'service' })
    const res = await groupUpdate(ctx(), { groupId: GROUP, pageKind: 'business', useCase: 'service' })
    expect(res.patched).toEqual([])
    expect(sql(/set kind/)).toEqual([])
  })
})

describe('#363 — any component can be added to any Page', () => {
  it('a group turns on Products & services', async () => {
    install({ kind: 'group' })
    const res = await groupUpdate(ctx(), { groupId: GROUP, productsComponent: true })
    expect(res.patched).toContain('components')
    expect(sql(/jsonb_build_object\('products'/)[0]![1]).toEqual([GROUP, true])
  })
})
