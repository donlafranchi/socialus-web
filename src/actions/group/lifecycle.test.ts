import { describe, it, expect, vi, beforeEach } from 'vitest'

// #423 — the PM, 2026-10-06: an owner archives, deletes and restores their own
// Page. Owner-only in the handler, not just in the UI; delete keeps 14 days of
// grace, and restore clears the state cleanly.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn(async () => undefined),
}))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { groupArchive, groupRestore, groupDelete, groupDiscardDraft, DELETE_GRACE_DAYS } from './lifecycle'
import { getHandler } from '../index'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const OWNER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '22222222-2222-2222-2222-222222222222'
const GROUP = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-06T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function ctx(actingMemberId: string | null = OWNER): ActionContext {
  return { actingMemberId: actingMemberId as string, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }
}

function install(opts: { found?: boolean; state?: string; kind?: string; role?: string | null; deleteAfter?: Date | null; name?: string } = {}) {
  const { found = true, state = 'active', kind = 'group', role = kind === 'business' ? 'owner' : 'steward', deleteAfter = null, name = 'Oak Park Sourdough' } = opts
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/.test(sql) && /for update/.test(sql)) {
      return { rows: found ? [{ id: GROUP, kind, name, lifecycle_state: state, delete_after: deleteAfter, role }] : [] }
    }
    if (/update public\.groups/.test(sql)) return { rows: [], rowCount: 1 }
    return { rows: [] }
  })
}

const updates = (): QueryCall[] => (query.mock.calls as QueryCall[]).filter(([s]) => /update public\.groups/.test(s))
const event = () => (appendEvent.mock.calls[0] as unknown as [unknown, string, { event_kind: string; payload: Record<string, unknown> }])[2]

beforeEach(() => {
  query.mockReset()
  appendEvent.mockClear()
})

describe('registered as verbs', () => {
  it('archive, restore and delete are in the registry', () => {
    expect(getHandler('group.archive')).toBe(groupArchive)
    expect(getHandler('group.restore')).toBe(groupRestore)
    expect(getHandler('group.delete')).toBe(groupDelete)
  })
})

describe('only the managing role', () => {
  for (const [verb, run] of [
    ['archive', (c: ActionContext) => groupArchive(c, { groupId: GROUP })],
    ['delete', (c: ActionContext) => groupDelete(c, { groupId: GROUP, confirmName: 'Oak Park Sourdough' })],
    ['restore', (c: ActionContext) => groupRestore(c, { groupId: GROUP })],
  ] as const) {
    it(`${verb}: refuses someone who does not manage the Page, writing nothing`, async () => {
      install({ role: null, state: verb === 'restore' ? 'archived' : 'active' })
      await expect(run(ctx(STRANGER))).rejects.toBeInstanceOf(AuthorizationError)
      expect(updates()).toHaveLength(0)
      expect(appendEvent).not.toHaveBeenCalled()
    })

    it(`${verb}: refuses a signed-out caller`, async () => {
      install()
      await expect(run(ctx(null))).rejects.toBeInstanceOf(AuthorizationError)
    })

    it(`${verb}: a missing Page is missing`, async () => {
      install({ found: false })
      await expect(run(ctx())).rejects.toBeInstanceOf(NotFoundError)
    })
  }

  it('refuses a follower who holds a role that is not the managing one', async () => {
    install({ kind: 'business', role: 'member' })
    await expect(groupArchive(ctx(), { groupId: GROUP })).rejects.toBeInstanceOf(AuthorizationError)
  })
})

describe('archive', () => {
  it('hides a live Page and records it', async () => {
    install()
    const out = await groupArchive(ctx(), { groupId: GROUP })
    expect(out).toMatchObject({ groupId: GROUP, lifecycleState: 'archived' })
    const [text] = updates()[0]!
    expect(text).toMatch(/lifecycle_state = 'archived'/)
    expect(text).toMatch(/lifecycle_state = 'active'/)
    expect(event().event_kind).toBe('group.archived')
  })

  it('refuses a draft, an archived and a deleted Page', async () => {
    for (const state of ['draft', 'archived', 'dissolved']) {
      install({ state })
      await expect(groupArchive(ctx(), { groupId: GROUP })).rejects.toBeInstanceOf(ValidationError)
    }
  })
})

describe('delete', () => {
  it('needs the Page name typed exactly', async () => {
    install()
    for (const confirmName of ['oak park sourdough', 'Oak Park', 'Oak Park Sourdough ']) {
      await expect(groupDelete(ctx(), { groupId: GROUP, confirmName })).rejects.toBeInstanceOf(ValidationError)
    }
    expect(updates()).toHaveLength(0)
  })

  it(`hides the Page at once and sets its removal ${DELETE_GRACE_DAYS} days on`, async () => {
    install()
    const out = await groupDelete(ctx(), { groupId: GROUP, confirmName: 'Oak Park Sourdough' })
    expect(DELETE_GRACE_DAYS).toBe(14)
    expect(out.lifecycleState).toBe('dissolved')
    expect(out.deleteAfter).toEqual(new Date(NOW.getTime() + 14 * DAY))
    const [text, params] = updates()[0]!
    expect(text).toMatch(/lifecycle_state = 'dissolved'/)
    expect(text).toMatch(/dissolved_at = \$2/)
    expect(text).toMatch(/delete_after = \$3/)
    expect(params).toEqual([GROUP, NOW, new Date(NOW.getTime() + 14 * DAY)])
    expect(event().event_kind).toBe('group.dissolved')
    expect(event().payload).toMatchObject({ from: 'active' })
  })

  it('deletes an archived Page too', async () => {
    install({ state: 'archived' })
    await expect(groupDelete(ctx(), { groupId: GROUP, confirmName: 'Oak Park Sourdough' })).resolves.toMatchObject({ lifecycleState: 'dissolved' })
  })

  it('refuses a draft or an already deleted Page', async () => {
    for (const state of ['draft', 'dissolved']) {
      install({ state })
      await expect(groupDelete(ctx(), { groupId: GROUP, confirmName: 'Oak Park Sourdough' })).rejects.toBeInstanceOf(ValidationError)
    }
  })
})

describe('restore', () => {
  it('brings an archived Page back', async () => {
    install({ state: 'archived' })
    const out = await groupRestore(ctx(), { groupId: GROUP })
    expect(out.lifecycleState).toBe('active')
    const [text] = updates()[0]!
    expect(text).toMatch(/lifecycle_state = 'active'/)
    expect(text).toMatch(/dissolved_at = null/)
    expect(text).toMatch(/delete_after = null/)
    expect(event()).toMatchObject({ event_kind: 'group.restored', payload: { from: 'archived' } })
  })

  it('brings a deleted Page back inside its 14 days, clearing the removal date', async () => {
    install({ state: 'dissolved', deleteAfter: new Date(NOW.getTime() + DAY) })
    const out = await groupRestore(ctx(), { groupId: GROUP })
    expect(out.lifecycleState).toBe('active')
    expect(event().payload).toMatchObject({ from: 'dissolved' })
  })

  it('refuses once the 14 days have passed', async () => {
    install({ state: 'dissolved', deleteAfter: new Date(NOW.getTime() - 1) })
    await expect(groupRestore(ctx(), { groupId: GROUP })).rejects.toBeInstanceOf(ValidationError)
    expect(updates()).toHaveLength(0)
  })

  it('refuses a dissolved Page with no removal date, and a live one', async () => {
    for (const state of ['dissolved', 'active', 'draft']) {
      install({ state })
      await expect(groupRestore(ctx(), { groupId: GROUP })).rejects.toBeInstanceOf(ValidationError)
    }
  })
})

// #463 — the PM, 2026-10-07: owners must be able to delete unpublished drafts.
// A draft reached nobody and has nothing to come back to, so it goes at once
// (no 14-day grace), by the managing role only, and only while it is a draft.
describe('#463 — discarding an unpublished draft', () => {
  const deletes = (re: RegExp): QueryCall[] => (query.mock.calls as QueryCall[]).filter(([s]) => re.test(s))
  const discard = (c: ActionContext = ctx()) => groupDiscardDraft(c, { groupId: GROUP })

  it('is a registered verb', () => {
    expect(getHandler('group.discard_draft')).toBe(groupDiscardDraft)
  })

  it('removes the draft and what hangs off it, by id, in that order', async () => {
    install({ state: 'draft' })
    const r = await discard()
    expect(r).toMatchObject({ groupId: GROUP })
    const sqls = (query.mock.calls as QueryCall[]).map(([s]) => s)
    const iItems = sqls.findIndex((s) => /delete from public\.items/.test(s))
    const iGroup = sqls.findIndex((s) => /delete from public\.groups/.test(s))
    expect(iItems).toBeGreaterThan(-1)
    expect(iGroup).toBeGreaterThan(iItems)
    expect(deletes(/delete from public\.groups/)[0]![1]).toEqual([GROUP])
    expect(deletes(/delete from public\.groups/)[0]![0]).toMatch(/lifecycle_state = 'draft'/)
  })

  it('refuses someone who does not manage the draft, deleting nothing', async () => {
    install({ state: 'draft', role: null })
    await expect(discard(ctx(STRANGER))).rejects.toBeInstanceOf(AuthorizationError)
    expect(deletes(/delete from/)).toHaveLength(0)
  })

  it('refuses a signed-out caller', async () => {
    install({ state: 'draft' })
    await expect(discard(ctx(null))).rejects.toBeInstanceOf(AuthorizationError)
    expect(deletes(/delete from/)).toHaveLength(0)
  })

  it.each(['active', 'archived', 'dissolved'])('refuses a %s Page: a live Page goes through Delete, with its grace', async (state) => {
    install({ state })
    await expect(discard()).rejects.toBeInstanceOf(ValidationError)
    expect(deletes(/delete from/)).toHaveLength(0)
  })

  it('reports a missing draft as not found', async () => {
    install({ found: false })
    await expect(discard()).rejects.toBeInstanceOf(NotFoundError)
  })
})

