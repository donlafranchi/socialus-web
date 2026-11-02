import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { memberHeartSet, memberSaveSet } from '@/actions/member/hearts-saves'

// #1171 (plan #269, Don 2026-11-02): a heart and a save, as separate things. A heart tells the poster who, by name
// (option A); it subscribes no one. A save is private. Against a real database: who reads a row, what can be hearted
// or saved, and the names a Page's managers see.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a heart shows its member and the Page’s managers, a save only its member, and neither subscribes anyone',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `9${String(n).padStart(7, '0')}-0000-4000-8000-000000001171`
const OWNER = id(1), ANA = id(2), BEA = id(3), GONE = id(4)
const PAGE = id(10), PRIVATE = id(11)
const POST = id(100), SAMPLE = id(101), HIDDEN = id(102), SECRET = id(103), MEMBERS_ONLY = id(104)

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)
const ctx = (m: string) => resolveActionContext({ actingMemberId: m })

async function as<T>(sub: string | null, sql: string, p: unknown[] = []) {
  await q('begin')
  try {
    if (sub) await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await q(sql, p)).rows as T[]
  } catch (err) {
    return (err as Error).message as unknown as T[]
  } finally {
    await q('rollback')
  }
}

/** As `as`, with public heart counts switched on for the one transaction. */
async function asPublic<T>(sub: string, sql: string, p: unknown[] = []) {
  await q('begin')
  try {
    await q(`create or replace function public.heart_counts_public() returns boolean language sql immutable set search_path = '' as $$ select true $$`)
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q('set local role authenticated')
    return (await q(sql, p)).rows as T[]
  } finally {
    await q('rollback')
  }
}

async function cleanup() {
  await q(`delete from public.hearts where member_id = any($1)`, [[OWNER, ANA, BEA, GONE]])
  await q(`delete from public.saves where member_id = any($1)`, [[OWNER, ANA, BEA, GONE]])
  await q(`delete from public.page_posts where group_id = any($1)`, [[PAGE, PRIVATE]])
  await q(`delete from public.group_memberships where group_id = any($1)`, [[PAGE, PRIVATE]])
  await q(`delete from public.groups where id = any($1)`, [[PAGE, PRIVATE]])
  await q(`delete from public.members where id = any($1)`, [[OWNER, ANA, BEA, GONE]])
  await q(`delete from auth.users where id = any($1)`, [[OWNER, ANA, BEA, GONE]])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [mid, h, name] of [[OWNER, 'h1171-owner', 'Owner'], [ANA, 'h1171-ana', 'Ana'], [BEA, 'h1171-bea', 'Bea'], [GONE, 'h1171-gone', 'Gone']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [mid, `${h}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$3)`, [mid, h, name])
  }
  await q(`insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id) values ($1,'interest','H1171 Hall','h1171-hall','active','listed',$2)`, [PAGE, OWNER])
  await q(`insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id) values ($1,'interest','H1171 Club','h1171-club','active','unlisted',$2)`, [PRIVATE, OWNER])
  for (const g of [PAGE, PRIVATE]) await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [g, OWNER])
  const post = `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability, sample_kind, hidden_at) values ($1,$2,$3,'active',$4,$5,$6)`
  await q(post, [POST, PAGE, 'Open mic tonight', 'listed', null, null])
  await q(post, [SAMPLE, PAGE, 'Sample: an event', 'listed', 'event', null])
  await q(post, [HIDDEN, PAGE, 'Hidden while we look', 'listed', null, null])
  await q(`update public.page_posts set hidden_at = now(), hidden_prior_discoverability = discoverability where id = $1`, [HIDDEN])
  await q(post, [SECRET, PRIVATE, 'Members only', 'unlisted', null, null])
  await q(post, [MEMBERS_ONLY, PAGE, 'For members of the hall', 'unlisted', null, null])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await q(`delete from public.hearts where member_id = any($1)`, [[OWNER, ANA, BEA, GONE]])
  await q(`delete from public.saves where member_id = any($1)`, [[OWNER, ANA, BEA, GONE]])
  await q(`update public.members set deleted_at = null where id = $1`, [GONE])
})

describe.skipIf(!RUNNABLE)('#1171 — a heart', () => {
  it('toggles on a post and on a Page, once per member', async () => {
    expect(await memberHeartSet(ctx(ANA), { postId: POST, on: true })).toEqual({ on: true })
    expect(await memberHeartSet(ctx(ANA), { postId: POST, on: true })).toEqual({ on: true })
    await memberHeartSet(ctx(ANA), { groupId: PAGE, on: true })
    expect((await q(`select post_id, group_id from public.hearts where member_id = $1 order by post_id nulls last`, [ANA])).rows).toEqual([
      { post_id: POST, group_id: null },
      { post_id: null, group_id: PAGE },
    ])
    expect(await memberHeartSet(ctx(ANA), { postId: POST, on: false })).toEqual({ on: false })
    expect((await q(`select count(*)::int n from public.hearts where member_id = $1 and post_id is not null`, [ANA])).rows[0].n).toBe(0)
  })

  it('subscribes no one: hearting adds no follow and no membership', async () => {
    await memberHeartSet(ctx(ANA), { groupId: PAGE, on: true })
    await memberHeartSet(ctx(ANA), { postId: POST, on: true })
    expect((await q(`select count(*)::int n from public.group_memberships where member_id = $1`, [ANA])).rows[0].n).toBe(0)
  })

  it('is refused on a sample, a hidden post, a Page or post the member cannot see, and signed out', async () => {
    await expect(memberHeartSet(ctx(ANA), { postId: SAMPLE, on: true })).rejects.toThrow()
    await expect(memberHeartSet(ctx(ANA), { postId: HIDDEN, on: true })).rejects.toThrow()
    await expect(memberHeartSet(ctx(ANA), { postId: SECRET, on: true })).rejects.toThrow()
    await expect(memberHeartSet(ctx(ANA), { groupId: PRIVATE, on: true })).rejects.toThrow()
    await expect(memberHeartSet(resolveActionContext({ actingMemberId: '' }), { postId: POST, on: true })).rejects.toThrow()
  })

  it('reads as its own member’s row only: not another member’s, not the owner’s, not signed out', async () => {
    await memberHeartSet(ctx(ANA), { postId: POST, on: true })
    expect(await as(ANA, 'select post_id from public.hearts')).toEqual([{ post_id: POST }])
    expect(await as(BEA, 'select post_id from public.hearts')).toEqual([])
    expect(await as(OWNER, 'select post_id from public.hearts')).toEqual([])
    expect(await as(null, 'select post_id from public.hearts')).toMatch(/permission denied/)
  })

  it('a Page’s managers see who, by display name, newest first; no one else gets names', async () => {
    await memberHeartSet(ctx(ANA), { postId: POST, on: true })
    await q(`update public.hearts set created_at = now() - interval '1 hour' where member_id = $1`, [ANA])
    await memberHeartSet(ctx(BEA), { postId: POST, on: true })
    await memberHeartSet(ctx(BEA), { groupId: PAGE, on: true })
    const [owner] = await as<{ v: { manages: boolean; page: { count: number; names?: string[] }; posts: { postId: string; count: number; names?: string[] }[] } }>(
      OWNER, 'select public.heart_view($1) v', [PAGE])
    expect(owner!.v.manages).toBe(true)
    expect(owner!.v.page).toEqual({ count: 1, names: ['Bea'] })
    expect(owner!.v.posts).toEqual([{ postId: POST, count: 2, names: ['Bea', 'Ana'] }])
    // Review of #1172: no public count for now, so anyone else gets nothing at all, not even a count or a post id.
    expect(await as<{ v: unknown }>(BEA, 'select public.heart_view($1) v', [PAGE])).toEqual([{ v: null }])
    expect(await as<{ v: unknown }>(null, 'select public.heart_view($1) v', [PAGE])).toEqual([{ v: null }])
  })

  it('with public counts switched on, anyone else gets counts on what they can see, never names or a members-only post', async () => {
    await memberHeartSet(ctx(ANA), { postId: POST, on: true })
    await memberHeartSet(ctx(OWNER), { postId: MEMBERS_ONLY, on: true })
    const [owner] = await as<{ v: { posts: { postId: string }[] } }>(OWNER, 'select public.heart_view($1) v', [PAGE])
    expect(owner!.v.posts.map((p) => p.postId).sort()).toEqual([POST, MEMBERS_ONLY].sort())
    const [bea] = await asPublic<{ v: { manages: boolean; posts: object[] } }>(BEA, 'select public.heart_view($1) v', [PAGE])
    expect(bea!.v.manages).toBe(false)
    expect(bea!.v.posts).toEqual([{ postId: POST, count: 1 }])
    expect(JSON.stringify(bea!.v)).not.toMatch(/Ana|names/)
  })

  it('a deleted member’s heart leaves the names and the count', async () => {
    await memberHeartSet(ctx(GONE), { postId: POST, on: true })
    await q(`update public.members set deleted_at = now() where id = $1`, [GONE])
    const [owner] = await as<{ v: { posts: { names?: string[]; count: number }[] } }>(OWNER, 'select public.heart_view($1) v', [PAGE])
    expect(owner!.v.posts).toEqual([])
  })
})

describe.skipIf(!RUNNABLE)('#1171 — a save', () => {
  it('toggles on a post, once per member', async () => {
    expect(await memberSaveSet(ctx(ANA), { postId: POST, on: true })).toEqual({ on: true })
    expect(await memberSaveSet(ctx(ANA), { postId: POST, on: true })).toEqual({ on: true })
    expect((await q(`select count(*)::int n from public.saves where member_id = $1`, [ANA])).rows[0].n).toBe(1)
    expect(await memberSaveSet(ctx(ANA), { postId: POST, on: false })).toEqual({ on: false })
    expect((await q(`select count(*)::int n from public.saves where member_id = $1`, [ANA])).rows[0].n).toBe(0)
  })

  it('is private: only its member reads it, never the Page’s managers', async () => {
    await memberSaveSet(ctx(ANA), { postId: POST, on: true })
    expect(await as(ANA, 'select post_id from public.saves')).toEqual([{ post_id: POST }])
    expect(await as(OWNER, 'select post_id from public.saves')).toEqual([])
    expect(await as(BEA, 'select post_id from public.saves')).toEqual([])
    expect(await as(null, 'select post_id from public.saves')).toMatch(/permission denied/)
    expect(JSON.stringify(await as(OWNER, 'select public.heart_view($1) v', [PAGE]))).not.toMatch(/Ana/)
  })

  it('is refused on a sample, a hidden post, a post the member cannot see, and signed out', async () => {
    await expect(memberSaveSet(ctx(ANA), { postId: SAMPLE, on: true })).rejects.toThrow()
    await expect(memberSaveSet(ctx(ANA), { postId: HIDDEN, on: true })).rejects.toThrow()
    await expect(memberSaveSet(ctx(ANA), { postId: SECRET, on: true })).rejects.toThrow()
    await expect(memberSaveSet(resolveActionContext({ actingMemberId: '' }), { postId: POST, on: true })).rejects.toThrow()
  })
})
