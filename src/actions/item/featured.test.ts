import { describe, it, expect, vi, beforeEach } from 'vitest'

// #909 — a Page's featured products and services: the people who manage the Page add, edit and remove up
// to 12. Each is an items row filed under the Page, its price on the item_products / item_services child.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn<(ctx: unknown, table: string, row: { event_kind: string; item_id?: string }) => Promise<void>>(
    async () => undefined,
  ),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { featuredItemSave, featuredItemRemove } from './featured'
import { FEATURED_ITEMS_MAX } from '../../lib/items/featured'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const OTHER = '33333333-3333-3333-3333-333333333333'
const ITEM = '44444444-4444-4444-4444-444444444444'
const PHOTO = `https://x.supabase.co/storage/v1/object/public/media/${OWNER}/55555555-5555-4555-8555-555555555555.webp`
const OTHERS_PHOTO = `https://x.supabase.co/storage/v1/object/public/media/${OTHER}/55555555-5555-4555-8555-555555555555.webp`
const NOW = new Date('2026-10-18T12:00:00Z')

const ctx = (actingMemberId: string = OWNER): ActionContext => ({
  actingMemberId,
  viaDelegationId: null,
  traceId: 't',
  db: {} as never,
  now: () => NOW,
})

const calls = (re: RegExp): QueryCall[] => (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

function install(opts: { roles?: Record<string, string>; kind?: string; count?: number; itemKind?: string | null } = {}) {
  const { roles = { [OWNER]: 'owner' }, kind = 'business', count = 0, itemKind = 'product' } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/join public\.group_memberships/i.test(sql)) {
      return { rows: [{ kind, role: roles[String(params[1])] ?? null }], rowCount: 1 }
    }
    if (/count\(\*\)/i.test(sql)) return { rows: [{ n: count, next: count }], rowCount: 1 }
    if (/select i\.kind\s+from public\.items/i.test(sql)) {
      return itemKind ? { rows: [{ kind: itemKind }], rowCount: 1 } : { rows: [], rowCount: 0 }
    }
    if (/insert into public\.items/i.test(sql)) return { rows: [{ id: ITEM }], rowCount: 1 }
    if (/update public\.items|public\.item_products|public\.item_services/i.test(sql)) return { rows: [{ id: ITEM }], rowCount: 1 }
    throw new Error('unexpected: ' + sql)
  })
}

const add = { groupId: GROUP, kind: 'product' as const, name: 'Milkweed seed', priceCents: 450, inStock: true }

beforeEach(() => appendEvent.mockClear())

describe('item.featured_save — who may', () => {
  it('refuses a signed-out caller', async () => {
    install()
    await expect(featuredItemSave(ctx(''), add)).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses a member who does not manage the Page', async () => {
    install({ roles: { [OWNER]: 'owner', [OTHER]: 'member' } })
    await expect(featuredItemSave(ctx(OTHER), add)).rejects.toBeInstanceOf(AuthorizationError)
    expect(calls(/insert into public\.items/i)).toHaveLength(0)
  })

  it("lets a social group's steward add one — any Page may carry the section", async () => {
    install({ kind: 'social', roles: { [OWNER]: 'steward' } })
    await expect(featuredItemSave(ctx(), add)).resolves.toEqual({ itemId: ITEM })
  })
})

describe('item.featured_save — adding', () => {
  it('files a published product under the Page, in stock, last in order, with its price', async () => {
    install({ count: 3 })
    await featuredItemSave(ctx(), { ...add, photoUrl: PHOTO })
    const [, p] = calls(/insert into public\.items/i)[0]!
    expect(p).toEqual(expect.arrayContaining([OWNER, 'product', GROUP, 'Milkweed seed', 'published', true, 3, PHOTO]))
    const [, child] = calls(/insert into public\.item_products/i)[0]!
    expect(child).toEqual([ITEM, 450])
    expect(appendEvent.mock.calls.map(([, t, r]) => [t, r.event_kind])).toEqual([['item_events', 'item.created']])
  })

  it('a service keeps its price on the service row, and no price is a quote', async () => {
    install()
    await featuredItemSave(ctx(), { ...add, kind: 'service', name: 'Bike tune-up', priceCents: null })
    const [sql, child] = calls(/insert into public\.item_services/i)[0]!
    expect(child).toEqual([ITEM, 'quote', null])
    expect(sql).toMatch(/rate_model/)
  })

  it(`refuses the ${FEATURED_ITEMS_MAX + 1}th`, async () => {
    install({ count: FEATURED_ITEMS_MAX })
    await expect(featuredItemSave(ctx(), add)).rejects.toBeInstanceOf(ValidationError)
    expect(calls(/insert into public\.items/i)).toHaveLength(0)
  })

  it('refuses a photo from someone else’s uploads', async () => {
    install()
    await expect(featuredItemSave(ctx(), { ...add, photoUrl: OTHERS_PHOTO })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an email address in the name or details', async () => {
    install()
    await expect(featuredItemSave(ctx(), { ...add, details: 'write me at a@b.co' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an empty name', async () => {
    install()
    await expect(featuredItemSave(ctx(), { ...add, name: '   ' })).rejects.toThrow()
  })
})

describe('item.featured_save — editing', () => {
  it('updates the row in place and only on this Page', async () => {
    install()
    await featuredItemSave(ctx(), { ...add, itemId: ITEM, name: 'Milkweed seed, 1 oz', inStock: false })
    const [sql, p] = calls(/update public\.items/i)[0]!
    expect(sql).toMatch(/where id = \$1 and group_id = \$2/)
    expect(p).toEqual(expect.arrayContaining([ITEM, GROUP, 'Milkweed seed, 1 oz', false]))
    expect(calls(/insert into public\.items/i)).toHaveLength(0)
    expect(appendEvent.mock.calls.map(([, , r]) => r.event_kind)).toEqual(['item.updated'])
  })

  // #909 — fix it and it shows again: an edit to the words clears a report's hide; the reports stay queued.
  it('an edit to the name or details clears a hide from a report', async () => {
    install()
    await featuredItemSave(ctx(), { ...add, itemId: ITEM, name: 'Milkweed seed, 1 oz' })
    const [sql] = calls(/update public\.items/i)[0]!
    expect(sql).toMatch(/hidden_at = case when title is distinct from \$4 or description is distinct from \$5 then null else hidden_at end/)
    expect(sql).toMatch(/removed_at = case when title is distinct from \$4 or description is distinct from \$5 then null else removed_at end/)
  })

  it('an edit is not counted against the limit', async () => {
    install({ count: FEATURED_ITEMS_MAX })
    await expect(featuredItemSave(ctx(), { ...add, itemId: ITEM })).resolves.toEqual({ itemId: ITEM })
  })

  it('switching product to service moves the price to the service row', async () => {
    install({ itemKind: 'product' })
    await featuredItemSave(ctx(), { ...add, itemId: ITEM, kind: 'service', priceCents: 4000 })
    expect(calls(/delete from public\.item_products/i)).toHaveLength(1)
    expect(calls(/insert into public\.item_services/i)[0]![1]).toEqual([ITEM, 'flat', 4000])
  })

  it('reports an item that is not on this Page as not found', async () => {
    install({ itemKind: null })
    await expect(featuredItemSave(ctx(), { ...add, itemId: ITEM })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('item.featured_remove', () => {
  it('soft-deletes and logs it', async () => {
    install()
    await featuredItemRemove(ctx(), { groupId: GROUP, itemId: ITEM })
    const [sql] = calls(/update public\.items/i)[0]!
    expect(sql).toMatch(/set deleted_at = \$3/)
    expect(appendEvent.mock.calls.map(([, , r]) => r.event_kind)).toEqual(['item.deleted'])
  })

  it('refuses a member who does not manage the Page', async () => {
    install({ roles: { [OWNER]: 'owner', [OTHER]: 'member' } })
    await expect(featuredItemRemove(ctx(OTHER), { groupId: GROUP, itemId: ITEM })).rejects.toBeInstanceOf(AuthorizationError)
    expect(calls(/update public\.items/i)).toHaveLength(0)
  })
})
