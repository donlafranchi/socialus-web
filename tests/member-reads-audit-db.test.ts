import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #246 — the signed-out and signed-in-stranger audit, member by member. After
// #249 and #253 no member row, follow, interest or response is readable; this
// file holds the two routes the audit found still open (2026-10-07):
//   * a seller's handle (a name: "rosa-delgado") on every item a Page lists,
//     through discoverable_items and the venue and feed functions;
//   * the media bucket's file list, whose top-level folders are every
//     uploader's member id.
// Rulings, 2026-09-30: a signed-in stranger reads no member field; a Page's
// front door shows no founder or seller; nobody accumulates a roster.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no stranger reads a seller handle or lists the media bucket, and owners still read their own',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const FOUNDER = 'a1000000-0000-4000-8000-000000000246'
const SELLER = 'a2000000-0000-4000-8000-000000000246' // sells only through the Page
const SOLO_OWNER = 'a3000000-0000-4000-8000-000000000246' // posts without a Page
const STRANGER = 'b1000000-0000-4000-8000-000000000246'
const PAGE = 'c1000000-0000-4000-8000-000000000246'
const LOCATION = 'd1000000-0000-4000-8000-000000000246'
const GROUPED = 'e1000000-0000-4000-8000-000000000246'
const SOLO = 'f1000000-0000-4000-8000-000000000246'
const MEMBERS = [FOUNDER, SELLER, SOLO_OWNER, STRANGER]
const HANDLE = { [FOUNDER]: 'b246-founder', [SELLER]: 'b246-page-seller', [SOLO_OWNER]: 'b246-solo-owner', [STRANGER]: 'b246-stranger' }
const OBJECT = `${SELLER}/00000000-0000-4000-8000-000000000246.webp`

let pool: Pool
let client: PoolClient

async function as<T = Record<string, unknown>>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const id of MEMBERS) {
    const h = HANDLE[id as keyof typeof HANDLE]
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','B246 Hall','b246-hall', ST_GeogFromText('POINT(-121.5 38.6)'))`,
    [LOCATION, FOUNDER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'group','B246 Club','b246-club','active','listed',$2,$3)`,
    [PAGE, FOUNDER, LOCATION],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, state, group_id) values
       ($1,$2,'gathering','B246 Run','published',$3),
       ($4,$5,'product','B246 Jam','published',null)`,
    [GROUPED, SELLER, PAGE, SOLO, SOLO_OWNER],
  )
  await client.query(`insert into public.item_gatherings (item_id, starts_at, host_member_id) values ($1, now() + interval '7 days', $2)`, [GROUPED, SELLER])
  for (const id of [GROUPED, SOLO]) {
    await client.query(`insert into public.item_locations (item_id, location_id, schedule_kind) values ($1,$2,'one_time')`, [id, LOCATION])
    await client.query(`insert into public.item_events (item_id, event_kind, acting_member_id) values ($1,'item.created',$2)`, [id, id === GROUPED ? SELLER : SOLO_OWNER])
  }
  await client.query(`insert into storage.objects (bucket_id, name, owner, owner_id) values ('media', $1, $2::uuid, $2::text)`, [OBJECT, SELLER])
  await client.query(`refresh materialized view public.discoverable_items`)
})

afterAll(async () => {
  if (!RUNNABLE) return
  // Storage refuses a direct delete (storage.protect_delete); this is the test's own row.
  await client.query(`begin`)
  await client.query(`set local session_replication_role = replica`)
  await client.query(`delete from storage.objects where bucket_id = 'media' and name = $1`, [OBJECT])
  await client.query(`commit`)
  await client.query(`delete from public.item_events where item_id = any($1)`, [[GROUPED, SOLO]])
  await client.query(`delete from public.item_locations where item_id = any($1)`, [[GROUPED, SOLO]])
  await client.query(`delete from public.item_gatherings where item_id = $1`, [GROUPED])
  await client.query(`delete from public.items where id = any($1)`, [[GROUPED, SOLO]])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.members where id = any($1)`, [MEMBERS])
  await client.query(`delete from auth.users where id = any($1)`, [MEMBERS])
  await client.query(`refresh materialized view public.discoverable_items`)
  client.release()
  await pool.end()
})

const READERS: [string, string | null][] = [['signed out', null], ['a signed-in stranger', STRANGER], ['another member', SOLO_OWNER]]

describe.skipIf(!RUNNABLE)('a seller on a Page is not named by what the Page lists', () => {
  // [guards F093.8]
  it.each(READERS)('discoverable_items keeps member_handle to itself for %s', async (_who, sub) => {
    await expect(as(sub, `select member_handle from public.discoverable_items limit 1`)).rejects.toThrow(/permission denied/)
  })

  // [guards F093.8]
  it.each(READERS)("the venue and feed lists never carry a Page item's seller handle, for %s", async (_who, sub) => {
    const hosted = await as(sub, `select * from public.venue_hosted_items($1, $2)`, [LOCATION, PAGE])
    // Anonymous callers cannot read locations at all, so only signed-in readers get the nearby list.
    const nearby = sub ? await as(sub, `select * from public.venue_nearby_items($1, null, 100000)`, [LOCATION]) : []
    const feed = await as(sub, `select * from public.locality_feed_items(null, null, 50)`)
    expect(hosted.map((r) => r.item_id)).toEqual([GROUPED])
    expect(JSON.stringify([hosted, nearby, feed])).not.toContain(HANDLE[SELLER])
    for (const r of [...hosted, ...nearby].filter((r) => r.item_id === GROUPED)) expect(r.member_handle).toBeNull()
  })

  it('an item posted without a Page keeps its handle: its URL is its address', async () => {
    const nearby = await as<{ item_id: string; member_handle: string | null }>(STRANGER, `select item_id, member_handle from public.venue_nearby_items($1, null, 100000)`, [LOCATION])
    expect(nearby.find((r) => r.item_id === SOLO)?.member_handle).toBe(HANDLE[SOLO_OWNER])
  })

  it('every other column of the lists still answers', async () => {
    const nearby = await as<{ item_id: string; title: string }>(STRANGER, `select item_id, title from public.venue_nearby_items($1, null, 100000)`, [LOCATION])
    expect(nearby.map((r) => r.item_id)).toEqual(expect.arrayContaining([GROUPED, SOLO]))
    expect(nearby.find((r) => r.item_id === GROUPED)?.title).toBe('B246 Run')
  })
})

describe.skipIf(!RUNNABLE)('the media bucket does not list its uploaders', () => {
  // [guards F093.8]
  it.each(READERS)('%s sees no file of anyone else', async (_who, sub) => {
    const rows = await as(sub, `select name from storage.objects where bucket_id = 'media'`)
    expect(rows).toEqual([])
  })

  it('an uploader still sees their own folder, for replacing and removing a photo', async () => {
    const rows = await as<{ name: string }>(SELLER, `select name from storage.objects where bucket_id = 'media'`)
    expect(rows.map((r) => r.name)).toEqual([OBJECT])
  })
})
