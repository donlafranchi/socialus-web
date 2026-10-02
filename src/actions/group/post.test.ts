import { describe, it, expect, vi, beforeEach } from 'vitest'

// F072 — a Page owner posts.
//
// Acceptance 1: only a Page's managing role can post; a member without that
// role gets no control and a direct write is refused.
//
// The managing role is not one role. Per managingRoleForKind(), a business
// Page is managed by role='owner' and every other kind by role='steward', so a
// handler that hardcoded 'owner' would lock the founder of a run club out of
// their own Page. The handler derives it from the kind instead, through the
// one function that already answers this question for group.create.
//
// Acceptance 4: an edit keeps the row id. Deleting is refused by absence —
// there is no handler, which is why a test asserts the registry has none.
//
// Acceptance 6: row and event in one transaction, per ADR-10.

type QueryCall = [string, unknown[]?]

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn<
    (ctx: unknown, table: string, row: { event_kind: string; payload?: Record<string, unknown> }) => Promise<void>
  >(async () => undefined),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { groupPostCreate, groupPostEdit } from './post'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const OTHER = '33333333-3333-3333-3333-333333333333'
const POST = '44444444-4444-4444-4444-444444444444'
const NOW = new Date('2026-09-15T12:00:00Z')

function ctx(actingMemberId: string = OWNER): ActionContext {
  return {
    actingMemberId,
    viaDelegationId: null,
    traceId: 't',
    db: {} as never,
    now: () => NOW,
  }
}

const calls = (re: RegExp): QueryCall[] =>
  (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))

function install(
  opts: { roles?: Record<string, string>; kind?: string; postExists?: boolean; groupExists?: boolean } = {},
) {
  const { roles = { [OWNER]: 'owner' }, kind = 'business', postExists = true, groupExists = true } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/join public\.group_memberships/i.test(sql)) {
      if (!groupExists) return { rows: [], rowCount: 0 }
      const memberId = String(params[1])
      return { rows: [{ kind, role: roles[memberId] ?? null }], rowCount: 1 }
    }
    if (/from public\.page_posts/i.test(sql)) {
      return postExists
        ? { rows: [{ id: POST, group_id: GROUP }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (/insert into public\.page_posts/i.test(sql)) {
      return { rows: [{ id: POST, created_at: NOW }], rowCount: 1 }
    }
    if (/update public\.page_posts/i.test(sql)) {
      return { rows: [{ id: POST, updated_at: NOW }], rowCount: 1 }
    }
    throw new Error('unexpected: ' + sql)
  })
}

beforeEach(() => appendEvent.mockClear())

describe('group.post_create — only the managing role can post', () => {
  it('refuses a signed-out caller', async () => {
    install()
    await expect(groupPostCreate(ctx(''), { groupId: GROUP, body: 'Sourdough is back Thursday.' }))
      .rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses a member who does not manage the Page', async () => {
    install({ roles: { [OWNER]: 'owner', [OTHER]: 'member' } })
    await expect(
      groupPostCreate(ctx(OTHER), { groupId: GROUP, body: 'Sourdough is back Thursday.' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(calls(/insert into public\.page_posts/i)).toHaveLength(0)
  })

  it('refuses someone with no membership at all', async () => {
    install({ roles: { [OWNER]: 'owner' } })
    await expect(
      groupPostCreate(ctx(OTHER), { groupId: GROUP, body: 'Sourdough is back Thursday.' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('reports a missing Page as not found', async () => {
    install({ groupExists: false })
    await expect(
      groupPostCreate(ctx(), { groupId: GROUP, body: 'Sourdough is back Thursday.' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("lets a run club's steward post — the managing role is not always 'owner'", async () => {
    install({ kind: 'interest', roles: { [OTHER]: 'steward' } })
    const r = await groupPostCreate(ctx(OTHER), { groupId: GROUP, body: 'Run on Sunday.' })
    expect(r.postId).toBe(POST)
  })

  it("refuses a steward on a business Page, where the managing role is 'owner'", async () => {
    install({ kind: 'business', roles: { [OTHER]: 'steward' } })
    await expect(groupPostCreate(ctx(OTHER), { groupId: GROUP, body: 'Nope.' }))
      .rejects.toBeInstanceOf(AuthorizationError)
  })

  it('lets the owner post, and writes the row live and listed', async () => {
    install()
    const r = await groupPostCreate(ctx(), { groupId: GROUP, body: 'Sourdough is back Thursday.' })
    expect(r.postId).toBe(POST)
    const [, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(params).toContain(GROUP)
    expect(params).toContain('Sourdough is back Thursday.')
    expect(params).toContain('active')
    expect(params).toContain('listed')
  })

  // F072 absorbed F073 on 2026-09-21, so the deferral this used to assert is
  // discharged. What replaces it is the property that made the deferral safe
  // in the first place: an announcement with no time writes a null, and is
  // therefore never returned by a time-windowed read.
  it('writes a start time when one was given', async () => {
    install()
    await groupPostCreate(ctx(), {
      groupId: GROUP,
      body: 'Bread class Thursday.',
      startsAt: '2026-09-25T02:00:00.000Z',
    })
    const [sql, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(sql).toMatch(/starts_at/i)
    expect(params).toContain('2026-09-25T02:00:00.000Z')
  })

  it('writes a null when none was given, rather than inventing one', async () => {
    install()
    await groupPostCreate(ctx(), { groupId: GROUP, body: 'Sourdough is back.' })
    const [, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(params).toContain(null)
    expect(params).not.toContain(undefined)
  })

  it('writes the announcement’s own place when one was given', async () => {
    install()
    await groupPostCreate(ctx(), {
      groupId: GROUP,
      body: 'Bread class at the church hall.',
      locationId: '22222222-2222-2222-2222-222222222222',
    })
    const [sql, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(sql).toMatch(/location_id/i)
    expect(params).toContain('22222222-2222-2222-2222-222222222222')
  })

  it('writes the event in the same transaction as the row', async () => {
    install()
    await groupPostCreate(ctx(), { groupId: GROUP, body: 'Sourdough is back Thursday.' })
    expect(appendEvent).toHaveBeenCalledTimes(1)
    const [, table, row] = appendEvent.mock.calls[0]!
    expect(table).toBe('group_events')
    expect(row.event_kind).toBe('group.post_created')
    expect(row.payload).toMatchObject({ post_id: POST })
  })

  it('refuses an empty body', async () => {
    install()
    await expect(groupPostCreate(ctx(), { groupId: GROUP, body: '   ' }))
      .rejects.toBeInstanceOf(ValidationError)
  })

  it('trims the body before storing it', async () => {
    install()
    await groupPostCreate(ctx(), { groupId: GROUP, body: '  Sourdough is back.  ' })
    const [, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(params).toContain('Sourdough is back.')
  })

  it('refuses a body past the column limit', async () => {
    install()
    await expect(groupPostCreate(ctx(), { groupId: GROUP, body: 'x'.repeat(5001) }))
      .rejects.toBeInstanceOf(ValidationError)
  })
})

describe('group.post_edit — in place, by the managing role only', () => {
  it('keeps the row id', async () => {
    install()
    const r = await groupPostEdit(ctx(), { postId: POST, body: 'Sourdough is back Friday.' })
    expect(r.postId).toBe(POST)
    const [sql] = calls(/update public\.page_posts/i)[0]!
    expect(sql).toMatch(/^\s*update public\.page_posts/i)
    expect(sql).not.toMatch(/insert/i)
  })

  it('refuses a member who does not manage the Page', async () => {
    install({ roles: { [OWNER]: 'owner', [OTHER]: 'member' } })
    await expect(groupPostEdit(ctx(OTHER), { postId: POST, body: 'Nope.' }))
      .rejects.toBeInstanceOf(AuthorizationError)
    expect(calls(/update public\.page_posts/i)).toHaveLength(0)
  })

  it('reports a missing post as not found', async () => {
    install({ postExists: false })
    await expect(groupPostEdit(ctx(), { postId: POST, body: 'Nope.' }))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('writes its own event kind', async () => {
    install()
    await groupPostEdit(ctx(), { postId: POST, body: 'Sourdough is back Friday.' })
    const [, table, row] = appendEvent.mock.calls[0]!
    expect(table).toBe('group_events')
    expect(row.event_kind).toBe('group.post_edited')
  })

  it('never dissolves or deletes on edit', async () => {
    install()
    await groupPostEdit(ctx(), { postId: POST, body: 'Sourdough is back Friday.' })
    const [sql] = calls(/update public\.page_posts/i)[0]!
    expect(sql).not.toMatch(/dissolved_at|lifecycle_state|discoverability/i)
  })
})

// #262 (F072 criterion 3, Don 2026-09-30): an optional end time.
describe('group.post — an end time', () => {
  it('writes one when given, beside the start', async () => {
    install()
    await groupPostCreate(ctx(), {
      groupId: GROUP,
      body: 'Bread class Thursday.',
      startsAt: '2026-09-25T02:00:00.000Z',
      endsAt: '2026-09-25T04:00:00.000Z',
    })
    const [sql, params] = calls(/insert into public\.page_posts/i)[0]!
    expect(sql).toMatch(/ends_at/i)
    expect(params).toContain('2026-09-25T04:00:00.000Z')
  })

  it('refuses an end with no start', async () => {
    install()
    await expect(
      groupPostCreate(ctx(), { groupId: GROUP, body: 'Soon.', endsAt: '2026-09-25T04:00:00.000Z' }),
    ).rejects.toThrow()
  })

  it('refuses an end at or before the start', async () => {
    install()
    await expect(
      groupPostCreate(ctx(), {
        groupId: GROUP,
        body: 'Backwards.',
        startsAt: '2026-09-25T04:00:00.000Z',
        endsAt: '2026-09-25T02:00:00.000Z',
      }),
    ).rejects.toThrow()
  })

  it('an edit can set or clear it', async () => {
    install()
    await groupPostEdit(ctx(), { postId: POST, body: 'Moved.', endsAt: null })
    const [sql, params] = calls(/update public\.page_posts/i)[0]!
    expect(sql).toMatch(/ends_at = \$/)
    expect(params).toContain(null)
  })
})
