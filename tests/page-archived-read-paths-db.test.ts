import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #439 — groups_hidden_owner_only (#423) hides an archived Page from all but
// its managers, but RLS does not reach the definer functions or the
// discoverable_items view. Each read path that bypasses it must say the same:
// an archived Page's items and its address answer nobody but its managers, and
// come back when it is restored, without anyone refreshing the view by hand.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "an archived Page's items and address are absent from every read path that bypasses RLS",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4390000-0000-4000-8000-000000000001'
const JOINED = 'a4390000-0000-4000-8000-000000000002'
const STRANGER = 'a4390000-0000-4000-8000-000000000003'
const LIVE = 'c4390000-0000-4000-8000-000000000001'
const ARCHIVED = 'c4390000-0000-4000-8000-000000000002'
const PAGES = [LIVE, ARCHIVED]
const LIVE_ITEM = 'e4390000-0000-4000-8000-000000000001'
const ARCHIVED_ITEM = 'e4390000-0000-4000-8000-000000000002'
const ITEMS = [LIVE_ITEM, ARCHIVED_ITEM]
const PEOPLE: [string, string][] = [
  [OWNER, 'p439-owner'],
  [JOINED, 'p439-joined'],
  [STRANGER, 'p439-stranger'],
]
const OTHERS: [string, string | null][] = [
  ['signed out', null],
  ['a stranger', STRANGER],
  ['a member who joined it', JOINED],
]

let pool: Pool
let client: PoolClient
let loc: string

async function asIn<T>(sub: string | null, sql: string, params: unknown[] = []) {
  if (sub) {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'authenticated' }),
    ])
  }
  await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
  const rows = (await client.query(sql, params)).rows as T[]
  await client.query('reset role')
  return rows
}

/** Runs `change` as postgres, then `read` as `sub`, in one transaction that is rolled back. */
async function after<T>(change: string | null, sub: string | null, read: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (change) await client.query(change)
    return await asIn<T>(sub, read, params)
  } finally {
    await client.query('rollback')
  }
}

const ids = async (sub: string | null, sql: string, params: unknown[] = [], change: string | null = null) =>
  (await after<{ id: string }>(change, sub, sql, params)).map((r) => r.id)

const FEED = `select item_id as id from public.discoverable_items where item_id = any($1)`

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  const metroId = (await client.query(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).rows[0].id
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
  loc = (
    await client.query(
      `insert into public.locations (member_id, kind, label, slug, geography, place_id)
       values ($1,'permanent','Oak Park','p439-loc', ST_GeogFromText('POINT(-121.4702 38.5412)'), $2) returning id`,
      [OWNER, place.id],
    )
  ).rows[0].id
  for (const [id, name, state, item] of [
    [LIVE, 'P439 Live', 'active', LIVE_ITEM],
    [ARCHIVED, 'P439 Archived', 'archived', ARCHIVED_ITEM],
  ]) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability,
         founder_member_id, anchor_location_id)
       values ($1,'group',$2,$3,'Here.',$4,'listed',$5,$6)`,
      [id, name, name.toLowerCase().replace(/ /g, '-'), state, OWNER, loc],
    )
    await client.query(
      `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
         ($1,$2,'steward','explicit','member'), ($1,$3,'member','explicit','member')`,
      [id, OWNER, JOINED],
    )
    await client.query(
      `insert into public.items (id, member_id, kind, title, state, group_id)
       values ($1,$2,'product',$3,'published',$4)`,
      [item, OWNER, `${name} jam`, id],
    )
    await client.query(
      `insert into public.item_locations (item_id, location_id, schedule_kind, status)
       values ($1,$2,'ongoing','approved')`,
      [item, loc],
    )
  }
  // The fixture's own items are new to the view; publishing would refresh it.
  await client.query(`refresh materialized view public.discoverable_items`)
})

afterAll(async () => {
  if (!RUNNABLE) return
  const people = PEOPLE.map(([id]) => id)
  await client.query(`delete from public.item_events where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.items where id = any($1)`, [ITEMS])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [PAGES])
  await client.query(`delete from public.group_events where group_id = any($1)`, [PAGES])
  await client.query(`delete from public.groups where id = any($1)`, [PAGES])
  await client.query(`delete from public.location_events where acting_member_id = any($1)`, [people])
  await client.query(`delete from public.locations where member_id = any($1)`, [people])
  await client.query(`delete from public.member_events where member_id = any($1)`, [people])
  await client.query(`delete from public.members where id = any($1)`, [people])
  await client.query(`delete from auth.users where id = any($1)`, [people])
  await client.query(`refresh materialized view public.discoverable_items`)
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("#439 — an archived Page's items and address answer only its managers", () => {
  for (const [who, sub] of OTHERS) {
    it(`Explore's item index leaves the archived Page's item out for ${who}, and keeps the live one`, async () => {
      expect(await ids(sub, FEED, [ITEMS])).toEqual([LIVE_ITEM])
    })

    it(`the venue's hosted items leave the archived Page's item out for ${who}`, async () => {
      const q = `select item_id as id from public.venue_hosted_items($1, $2)`
      expect(await ids(sub, q, [loc, LIVE])).toEqual([LIVE_ITEM])
      expect(await ids(sub, q, [loc, ARCHIVED])).toEqual([])
    })
  }

  it("the archived Page's address resolves for nobody but its manager", async () => {
    const q = `select group_id as id from public.group_url_prefixes($1)`
    for (const sub of [STRANGER, JOINED]) {
      expect(await ids(sub, q, [PAGES])).toEqual([LIVE])
    }
    expect((await ids(OWNER, q, [PAGES])).sort()).toEqual([...PAGES].sort())
  })

  it('archiving a live Page takes its item out of the index at once', async () => {
    const change = `update public.groups set lifecycle_state = 'archived' where id = '${LIVE}'`
    expect(await ids(null, FEED, [ITEMS], change)).toEqual([])
  })

  it('restoring the archived Page brings its item back at once', async () => {
    const change = `update public.groups set lifecycle_state = 'active' where id = '${ARCHIVED}'`
    expect((await ids(null, FEED, [ITEMS], change)).sort()).toEqual([...ITEMS].sort())
  })

  // Asked of the catalog rather than by calling it: on the local image a
  // permission-denied function call crashes the server (signal 11).
  it('the refresh on a lifecycle change cannot be called by a member or a visitor', async () => {
    const fn = (
      await client.query(
        `select t.tgfoid::regprocedure::text as fn from pg_trigger t
          where t.tgrelid = 'public.groups'::regclass and t.tgname = 'trg_refresh_discoverable_items_on_page_state'`,
      )
    ).rows[0]?.fn
    expect(fn).toBeTruthy()
    for (const role of ['anon', 'authenticated']) {
      const r = await client.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn])
      expect(r.rows[0].ok).toBe(false)
    }
  })
})
