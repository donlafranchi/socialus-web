import { describe, it, expect, vi, beforeEach } from 'vitest'

// F067 — following a Page.
//
// Privacy decides which relationship is written (Don, 2026-09-15): a private
// Page is joined as a member, anything else is followed. The `source` written
// alongside is not cosmetic — `memberships_select_listed_group` returns only
// source='explicit', so writing a follower as 'soft_via_follow' is what keeps
// an open Page's followers unreadable (F067 acceptance 2).

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

import { groupFollow, groupUnfollow } from './follow'
import { AuthorizationError, NotFoundError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP = '11111111-1111-1111-1111-111111111111'
const MEMBER = '22222222-2222-2222-2222-222222222222'

function ctx(actingMemberId: string = MEMBER): ActionContext {
  return { actingMemberId, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date('2026-09-15T12:00:00Z') }
}

const calls = (re: RegExp): QueryCall[] =>
  (query.mock.calls as QueryCall[]).filter(([sql]) => re.test(sql))
const insertParams = () => (calls(/insert into public\.group_memberships/i)[0]?.[1] ?? []) as unknown[]

function install(opts: { discoverability?: string; exists?: boolean } = {}) {
  const { discoverability = 'listed', exists = true } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/i.test(sql)) {
      return { rows: exists ? [{ id: GROUP, discoverability }] : [], rowCount: exists ? 1 : 0 }
    }
    if (/insert into public\.group_memberships/i.test(sql)) return { rows: [{ group_id: GROUP }], rowCount: 1 }
    if (/update public\.group_memberships/i.test(sql)) return { rows: [{ group_id: GROUP }], rowCount: 1 }
    throw new Error('unexpected: ' + sql)
  })
}

beforeEach(() => appendEvent.mockClear())

describe('group.follow — an open Page is followed', () => {
  it('writes relationship=follower', async () => {
    install({ discoverability: 'listed' })
    const r = await groupFollow(ctx(), { groupId: GROUP })
    expect(r.relationship).toBe('follower')
    expect(insertParams()).toContain('follower')
  })

  it("writes source='soft_via_follow', which is what hides the follower list", async () => {
    // Not a detail: memberships_select_listed_group returns source='explicit'
    // only. An 'explicit' follower would be publicly readable on a listed Page.
    install({ discoverability: 'listed' })
    await groupFollow(ctx(), { groupId: GROUP })
    expect(insertParams()).toContain('soft_via_follow')
    expect(insertParams()).not.toContain('explicit')
  })

  it('treats an unlisted Page as followable too', async () => {
    install({ discoverability: 'unlisted' })
    expect((await groupFollow(ctx(), { groupId: GROUP })).relationship).toBe('follower')
  })
})

describe('group.follow — a private Page is joined', () => {
  it('writes relationship=member, not follower', async () => {
    install({ discoverability: 'private' })
    const r = await groupFollow(ctx(), { groupId: GROUP })
    expect(r.relationship).toBe('member')
    expect(insertParams()).toContain('member')
  })

  it("writes source='explicit', so co-members can see each other", async () => {
    // F067 acceptance 3. current_member_explicit_group_ids() filters on this.
    install({ discoverability: 'private' })
    await groupFollow(ctx(), { groupId: GROUP })
    expect(insertParams()).toContain('explicit')
  })
})

describe('group.follow — guards', () => {
  it('requires a signed-in member', async () => {
    install()
    await expect(groupFollow(ctx('self-bootstrap'), { groupId: GROUP })).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses a Page that does not exist or is dissolved', async () => {
    install({ exists: false })
    await expect(groupFollow(ctx(), { groupId: GROUP })).rejects.toBeInstanceOf(NotFoundError)
    expect(calls(/insert into public\.group_memberships/i)).toHaveLength(0)
  })

  it('grants no role beyond the plain one — F067 acceptance 4', async () => {
    install()
    await groupFollow(ctx(), { groupId: GROUP })
    const p = insertParams()
    expect(p).not.toContain('owner')
    expect(p).not.toContain('steward')
  })

  it('is idempotent: following twice writes one row', async () => {
    install()
    await groupFollow(ctx(), { groupId: GROUP })
    expect(calls(/insert into public\.group_memberships/i)[0]![0]).toMatch(/on conflict/i)
  })

  it('writes an event', async () => {
    install()
    await groupFollow(ctx(), { groupId: GROUP })
    expect(appendEvent).toHaveBeenCalled()
  })
})

describe('group.unfollow', () => {
  it('soft-leaves rather than deleting the row', async () => {
    install()
    await groupUnfollow(ctx(), { groupId: GROUP })
    const [sql] = calls(/update public\.group_memberships/i)[0]!
    expect(sql).toMatch(/left_at/)
    expect(calls(/delete from/i)).toHaveLength(0)
  })

  it('requires a signed-in member', async () => {
    install()
    await expect(groupUnfollow(ctx('self-bootstrap'), { groupId: GROUP })).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('writes an event', async () => {
    install()
    await groupUnfollow(ctx(), { groupId: GROUP })
    expect(appendEvent).toHaveBeenCalled()
  })
})
