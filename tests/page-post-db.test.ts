// F072 — the composer against a real database.
//
// The unit tests mock the client, so they prove the handler asks the right
// questions and prove nothing about whether Postgres answers. Two things here
// can only fail for real: `group_events.event_kind` is an allowlist, and a
// refused event kind rolls the post back with it (acceptance 6). That is
// exactly the failure mode that reached production once already.
//
// Seeded and rolled back in one transaction, so nothing survives the run.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupPostCreate, groupPostEdit } from '../src/actions'
import { AuthorizationError } from '../src/actions'
import type { ActionContext } from '../src/actions'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a Page owner can post, the event records it, and neither exists without the other',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000f072'
const OUTSIDER = 'bbbbbbbb-0000-4000-8000-00000000f072'
const SHOP = 'cccccccc-0000-4000-8000-00000000f072'
const CLUB = 'dddddddd-0000-4000-8000-00000000f072'

let pool: Pool
let client: PoolClient

/** The handlers open their own transaction through withTransaction(), so the
 *  seed has to be committed rather than held open, and cleaned up after. */
beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()

  for (const [id, h] of [[OWNER, 'f072-owner'], [OUTSIDER, 'f072-outsider']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(
      `insert into public.members (id, handle, display_name) values ($1,$2,$3)`,
      [id, h, h],
    )
  }

  // A business Page, managed by role='owner'...
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'business','F072 Bakery','f072-bakery','active','listed',$2)`,
    [SHOP, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'owner','explicit','member')`,
    [SHOP, OWNER],
  )
  // ...and a run club, managed by role='steward'. Same person, different word.
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','F072 Run Club','f072-run-club','active','listed',$2)`,
    [CLUB, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'steward','explicit','member')`,
    [CLUB, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'member','explicit','member')`,
    [SHOP, OUTSIDER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.group_events where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.groups where id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, OUTSIDER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, OUTSIDER]])
  client.release()
  await pool.end()
})

function ctx(actingMemberId: string): ActionContext {
  return {
    actingMemberId,
    viaDelegationId: null,
    traceId: 'f072-db',
    db: null as never,
    now: () => new Date(),
  }
}

describe.skipIf(!RUNNABLE)('F072 — posting, for real', () => {
  it('writes the post and the event together', async () => {
    const r = await groupPostCreate(ctx(OWNER), {
      groupId: SHOP,
      body: 'Sourdough is back Thursday.',
    })

    const post = await client.query(`select body, lifecycle_state, discoverability, starts_at
                                       from public.page_posts where id = $1`, [r.postId])
    expect(post.rows[0]).toMatchObject({
      body: 'Sourdough is back Thursday.',
      lifecycle_state: 'active',
      discoverability: 'listed',
      starts_at: null,
    })

    const ev = await client.query(
      `select event_kind, payload from public.group_events
        where group_id = $1 and event_kind = 'group.post_created'`,
      [SHOP],
    )
    expect(ev.rowCount).toBe(1)
    expect(ev.rows[0].payload).toMatchObject({ post_id: r.postId })
  })

  it('lets the run club steward post too', async () => {
    const r = await groupPostCreate(ctx(OWNER), { groupId: CLUB, body: 'Run on Sunday.' })
    const post = await client.query(`select group_id from public.page_posts where id = $1`, [r.postId])
    expect(post.rows[0].group_id).toBe(CLUB)
  })

  it('refuses an ordinary member, and leaves no row behind', async () => {
    const before = await client.query(`select count(*)::int as n from public.page_posts where group_id = $1`, [SHOP])
    await expect(groupPostCreate(ctx(OUTSIDER), { groupId: SHOP, body: 'Not mine to say.' }))
      .rejects.toBeInstanceOf(AuthorizationError)
    const after = await client.query(`select count(*)::int as n from public.page_posts where group_id = $1`, [SHOP])
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it('edits in place, keeping the id, and records its own kind', async () => {
    const created = await groupPostCreate(ctx(OWNER), { groupId: SHOP, body: 'Open late tonight.' })
    const edited = await groupPostEdit(ctx(OWNER), { postId: created.postId, body: 'Open late tomorrow.' })
    expect(edited.postId).toBe(created.postId)

    const post = await client.query(`select body from public.page_posts where id = $1`, [created.postId])
    expect(post.rows[0].body).toBe('Open late tomorrow.')

    const ev = await client.query(
      `select count(*)::int as n from public.group_events
        where group_id = $1 and event_kind = 'group.post_edited'`,
      [SHOP],
    )
    expect(ev.rows[0].n).toBe(1)
  })

  // RLS is what a browser actually gets back, and it is the half a handler
  // test cannot see. A post nobody can read is not a post.
  async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    await client.query('begin')
    try {
      await client.query(`set local role anon`)
      const { rows } = await client.query(sql, params)
      return rows as T[]
    } finally {
      await client.query('rollback')
    }
  }

  // AMENDED BY F093 (#215), 2026-09-23. This read "is readable by a stranger,
  // which is what putting it on a Page means", and it asserted exactly that: a
  // stranger selecting the row and getting it back.
  //
  // Don ruled the other way. Who exists is public, what's happening is not,
  // but THAT something is happening is public — so a stranger still FINDS the
  // announcement and no longer READS it. F072's numbered acceptance is
  // untouched: criterion 2 asks that an announcement appear "on its Page and
  // in browse", and it still does, in withheld form (F093 criterion 7). What
  // changed is the sentence in F072's STORY about a stranger finding what is
  // on this week, which F093 supersedes.
  //
  // The original intent survives inverted rather than deleted: a post nobody
  // can find is not a post, so the assertion moved from the table to the
  // withheld path rather than being dropped.
  it('is findable by a stranger, and not readable — F093', async () => {
    const created = await groupPostCreate(ctx(OWNER), { groupId: SHOP, body: 'Market stall Saturday.' })

    const readable = await asAnon<{ id: string }>(
      `select id from public.page_posts where id = $1`,
      [created.postId],
    )
    expect(readable).toHaveLength(0)

    const findable = await asAnon<{ result_id: string }>(
      `select result_id from public.announcements_withheld(p_group_id => $1)`,
      [SHOP],
    )
    expect(findable.map((r) => r.result_id)).toContain(created.postId)
  })

  it('is withheld from a stranger once its Page stops being listed', async () => {
    const created = await groupPostCreate(ctx(OWNER), { groupId: SHOP, body: 'Quietly.' })
    await client.query(`update public.groups set discoverability = 'private' where id = $1`, [SHOP])
    try {
      const rows = await asAnon(`select id from public.page_posts where id = $1`, [created.postId])
      expect(rows).toHaveLength(0)
    } finally {
      await client.query(`update public.groups set discoverability = 'listed' where id = $1`, [SHOP])
    }
  })

  it('cannot be written directly by a client, whatever it asks for (ADR-7)', async () => {
    await expect(
      asAnon(
        `insert into public.page_posts (group_id, body, lifecycle_state, discoverability)
         values ($1, 'Straight in.', 'active', 'listed')`,
        [SHOP],
      ),
    ).rejects.toThrow()
  })

  it('cannot be deleted directly by a client either (acceptance 4)', async () => {
    // Not an error, and that is the point worth writing down: with no DELETE
    // policy, Postgres finds no rows the caller may delete and reports success
    // having deleted nothing. A test that only asserted "it throws" would pass
    // on a table that had just been emptied. So this asserts the row is still
    // there afterwards.
    const created = await groupPostCreate(ctx(OWNER), { groupId: SHOP, body: 'Stays put.' })
    await asAnon(`delete from public.page_posts where id = $1`, [created.postId])
    const still = await client.query(`select id from public.page_posts where id = $1`, [created.postId])
    expect(still.rowCount).toBe(1)
  })

  it('has no delete handler at all (acceptance 4)', async () => {
    const { listHandlers } = await import('../src/actions')
    expect(listHandlers().filter((n) => /post.*(delete|remove)/i.test(n))).toEqual([])
  })
})
