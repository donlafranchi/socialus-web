import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #423 — the PM, 2026-10-06: an owner archives or deletes their Page. Archived
// is hidden from everyone but the people who manage it (the managing role for
// its kind, not the founder); deleted is hidden at once, restorable
// for 14 days, then removed with its posts. Enforced in SQL, so every door
// (the Page address, Explore, the map, PostgREST) answers the same way.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'an archived or deleted Page is visible only to its owner, and is removed 14 days after delete',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4230000-0000-4000-8000-000000000001'
const JOINED = 'a4230000-0000-4000-8000-000000000002'
const STRANGER = 'a4230000-0000-4000-8000-000000000003'
const CO_STEWARD = 'a4230000-0000-4000-8000-000000000004'
const FOLLOWER = 'a4230000-0000-4000-8000-000000000005'
const LIVE = 'c4230000-0000-4000-8000-000000000001'
const ARCHIVED = 'c4230000-0000-4000-8000-000000000002'
const DELETED = 'c4230000-0000-4000-8000-000000000003'
const EXPIRED = 'c4230000-0000-4000-8000-000000000004'
const PAGES = [LIVE, ARCHIVED, DELETED, EXPIRED]
// Archived, founded by OWNER, who has since stepped down; CO_STEWARD manages it.
const HANDED_OVER = 'c4230000-0000-4000-8000-000000000005'
// Archived business founded by CO_STEWARD, who now holds 'steward' (which does
// not manage a business); OWNER holds 'owner'.
const SHOP = 'c4230000-0000-4000-8000-000000000006'
const ALL_PAGES = [...PAGES, HANDED_OVER, SHOP]
const post = (page: string) => `d${page.slice(1)}`
const EXPIRED_ITEM = 'e4230000-0000-4000-8000-000000000004'
const PEOPLE: [string, string][] = [
  [OWNER, 'p423-owner'],
  [JOINED, 'p423-joined'],
  [STRANGER, 'p423-stranger'],
  [CO_STEWARD, 'p423-co-steward'],
  [FOLLOWER, 'p423-follower'],
]

let pool: Pool
let client: PoolClient
let metroId: string

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

const ids = async (sub: string | null, sql: string, params: unknown[] = []) =>
  (await as<{ id: string }>(sub, sql, params)).map((r) => r.id)

/** Runs `sql` as postgres inside a transaction that is rolled back, then reads
 *  back what is left — so the purge is exercised without consuming the fixture. */
async function afterPurge(sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    const out = (await client.query(sql, params)).rows[0]
    const pages = (await client.query(`select id from public.groups where id = any($1)`, [PAGES])).rows.map((r) => r.id)
    const posts = (await client.query(`select id from public.page_posts where group_id = any($1)`, [PAGES])).rows.map((r) => r.id)
    const items = (await client.query(`select id from public.items where id = $1`, [EXPIRED_ITEM])).rows.map((r) => r.id)
    return { out, pages, posts, items }
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  metroId = (await client.query(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).rows[0].id
  const place = (await client.query(`select id from public.places where slug = 'oak-park' limit 1`)).rows[0]
  for (const [id, h] of PEOPLE) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name, home_metro_id) values ($1,$2,$2,$3)`, [
      id,
      h,
      metroId,
    ])
  }
  const loc = (
    await client.query(
      `insert into public.locations (member_id, kind, label, slug, geography, place_id)
       values ($1,'permanent','Oak Park','p423-loc', ST_GeogFromText('POINT(-121.4702 38.5412)'), $2) returning id`,
      [OWNER, place.id],
    )
  ).rows[0].id
  const rows: [string, string, string, string | null, string | null][] = [
    [LIVE, 'P423 Live', 'active', null, null],
    [ARCHIVED, 'P423 Archived', 'archived', null, null],
    // Deleted 13 days ago: one day of grace left.
    [DELETED, 'P423 Deleted', 'dissolved', `now() - interval '13 days'`, `now() + interval '1 day'`],
    // Deleted 15 days ago: past its 14 days.
    [EXPIRED, 'P423 Expired', 'dissolved', `now() - interval '15 days'`, `now() - interval '1 day'`],
  ]
  for (const [id, name, state, dissolvedAt, deleteAfter] of rows) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability,
         founder_member_id, anchor_location_id, dissolved_at, delete_after)
       values ($1,'group',$2,$3,'Here.',$4,'listed',$5,$6,${dissolvedAt ?? 'null'},${deleteAfter ?? 'null'})`,
      [id, name, name.toLowerCase().replace(/ /g, '-'), state, OWNER, loc],
    )
    await client.query(
      `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
         ($1,$2,'steward','explicit','member'), ($1,$3,'member','explicit','member'),
         ($1,$4,'member','explicit','follower')`,
      [id, OWNER, JOINED, FOLLOWER],
    )
    await client.query(
      `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability)
       values ($1,$2,$3,'active','listed')`,
      [post(id), id, `${name} post`],
    )
  }
  for (const [id, kind, name, founder] of [
    [HANDED_OVER, 'group', 'P423 Handed Over', OWNER],
    [SHOP, 'business', 'P423 Shop', CO_STEWARD],
  ]) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability,
         founder_member_id, anchor_location_id)
       values ($1,$2,$3,$4,'Here.','archived','listed',$5,$6)`,
      [id, kind, name, name.toLowerCase().replace(/ /g, '-'), founder, loc],
    )
  }
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship, left_at) values
       ($1,$2,'steward','explicit','member',now()), ($1,$3,'steward','explicit','member',null),
       ($1,$4,'member','explicit','member',null),
       ($5,$2,'owner','explicit','member',null), ($5,$3,'steward','explicit','member',null)`,
    [HANDED_OVER, OWNER, CO_STEWARD, JOINED, SHOP],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, state, group_id)
     values ($1,$2,'gathering','P423 expired run','published',$3)`,
    [EXPIRED_ITEM, OWNER, EXPIRED],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  const people = PEOPLE.map(([id]) => id)
  await client.query(`delete from public.item_events where item_id = $1`, [EXPIRED_ITEM])
  await client.query(`delete from public.items where id = $1`, [EXPIRED_ITEM])
  await client.query(`delete from public.page_posts where group_id = any($1)`, [ALL_PAGES])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [ALL_PAGES])
  await client.query(`delete from public.group_events where group_id = any($1)`, [ALL_PAGES])
  await client.query(`delete from public.groups where id = any($1)`, [ALL_PAGES])
  await client.query(`delete from public.location_events where acting_member_id = any($1)`, [people])
  await client.query(`delete from public.locations where member_id = any($1)`, [people])
  await client.query(`delete from public.member_events where member_id = any($1)`, [people])
  await client.query(`delete from public.members where id = any($1)`, [people])
  await client.query(`delete from auth.users where id = any($1)`, [people])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#423 — an archived or deleted Page answers only the people who manage it', () => {
  const OTHERS: [string, string | null][] = [
    ['signed out', null],
    ['a stranger', STRANGER],
    ['a member who joined it', JOINED],
    ['a follower', FOLLOWER],
  ]

  for (const [who, sub] of OTHERS) {
    it(`neither the Page nor its posts answer ${who}`, async () => {
      const pages = await ids(sub, `select id from public.groups where id = any($1)`, [PAGES])
      expect(pages).toEqual([LIVE])
      const posts = await ids(sub, `select id from public.page_posts where group_id = any($1)`, [PAGES])
      expect(posts.filter((p) => p !== post(LIVE))).toEqual([])
    })
  }

  it('the owner still reads both, to restore them', async () => {
    const pages = await ids(OWNER, `select id from public.groups where id = any($1)`, [PAGES])
    expect(pages.sort()).toEqual([...PAGES].sort())
  })

  it('a steward who did not found it reads it; the founder who stepped down does not', async () => {
    expect(await ids(CO_STEWARD, `select id from public.groups where id = $1`, [HANDED_OVER])).toEqual([HANDED_OVER])
    expect(await ids(OWNER, `select id from public.groups where id = $1`, [HANDED_OVER])).toEqual([])
    expect(await ids(JOINED, `select id from public.groups where id = $1`, [HANDED_OVER])).toEqual([])
  })

  it('a business answers its owner, not its founder who is now only a steward, since owner is what manages a business', async () => {
    expect(await ids(OWNER, `select id from public.groups where id = $1`, [SHOP])).toEqual([SHOP])
    expect(await ids(CO_STEWARD, `select id from public.groups where id = $1`, [SHOP])).toEqual([])
  })

  // Definer, so the groups policy does not recurse through group_memberships'.
  it('names the manager through a definer function with a pinned search path', async () => {
    const r = await client.query(
      `select p.prosecdef as definer, p.proconfig as config
         from pg_proc p where p.oid = 'public.current_member_managing_group_ids()'::regprocedure`,
    )
    expect(r.rows[0]).toEqual({ definer: true, config: ['search_path=""'] })
    expect(await ids(null, `select id from public.current_member_managing_group_ids() as id`)).toEqual([])
  })

  it('Explore and the map leave both out, even for the owner', async () => {
    for (const sub of [null, STRANGER, OWNER]) {
      const rows = await ids(sub, `select result_id as id from public.browse_feed(p_metro_id => $1, p_limit => 500)`, [metroId])
      expect(rows).not.toContain(ARCHIVED)
      expect(rows).not.toContain(DELETED)
      expect(rows).not.toContain(post(ARCHIVED))
    }
  })

  it('delete_after belongs to a deleted Page only', async () => {
    await client.query('begin')
    try {
      await expect(client.query(`update public.groups set delete_after = now() where id = $1`, [LIVE])).rejects.toThrow()
    } finally {
      await client.query('rollback')
    }
  })
})

describe.skipIf(!RUNNABLE)('#423 — the purge', () => {
  it('removes a Page 14 days after delete, with its posts and items, and nothing else', async () => {
    const r = await afterPurge(`select public.purge_deleted_pages() as n`)
    expect(r.out.n).toBe(1)
    expect(r.pages.sort()).toEqual([LIVE, ARCHIVED, DELETED].sort())
    expect(r.posts).not.toContain(post(EXPIRED))
    expect(r.posts).toContain(post(DELETED))
    expect(r.items).toEqual([])
  })

  it('removes nothing before its 14 days are up', async () => {
    const r = await afterPurge(`select public.purge_deleted_pages(now() - interval '2 days') as n`)
    expect(r.out.n).toBe(0)
    expect(r.pages).toContain(EXPIRED)
    expect(r.pages).toContain(DELETED)
  })

  it('leaves a dissolved Page with no removal date alone', async () => {
    await client.query('begin')
    try {
      await client.query(`update public.groups set delete_after = null where id = $1`, [EXPIRED])
      await client.query(`select public.purge_deleted_pages()`)
      const left = (await client.query(`select id from public.groups where id = $1`, [EXPIRED])).rows
      expect(left).toHaveLength(1)
    } finally {
      await client.query('rollback')
    }
  })

  // Asked of the catalog rather than by calling it: on the local image a
  // permission-denied function call crashes the server (signal 11).
  it('cannot be called by a member or a visitor', async () => {
    for (const role of ['anon', 'authenticated']) {
      const r = await client.query(
        `select has_function_privilege($1, 'public.purge_deleted_pages(timestamptz)', 'execute') as ok`,
        [role],
      )
      expect(r.rows[0].ok).toBe(false)
    }
  })
})
