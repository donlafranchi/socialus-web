import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #253 — after #249 no member row is readable, but three columns still tied a
// member to what they made, and item cards still named sellers. Rulings,
// 2026-09-30: nobody reads anything about a member but what they post on a
// Page; the front door shows no founder or seller.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no caller reads who founded, sells or hosts anything but their own, and owners still read their own',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a1000000-0000-4000-8000-000000000253'
const STRANGER = 'b1000000-0000-4000-8000-000000000253'
const PAGE = 'c1000000-0000-4000-8000-000000000253'
const LOCATION = 'd1000000-0000-4000-8000-000000000253'
const GATHERING = 'e1000000-0000-4000-8000-000000000253'
const SOLO = 'f1000000-0000-4000-8000-000000000253' // posted without a Page
const ITEMS = [GATHERING, SOLO]

let pool: Pool
let client: PoolClient

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

const allColumnsBut = async (table: string, ...skip: string[]): Promise<string> => {
  const { rows } = await client.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name <> all($2)`,
    [table, skip],
  )
  return rows.map((r) => `"${r.column_name}"`).join(', ')
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b253-owner'], [STRANGER, 'b253-stranger']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','B253 Hall','b253-hall', ST_GeogFromText('POINT(-121.5 38.6)'))`,
    [LOCATION, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'group','B253 Club','b253-club','active','listed',$2,$3)`,
    [PAGE, OWNER, LOCATION],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'steward','explicit','member')`,
    [PAGE, OWNER],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, state, group_id) values
       ($1,$2,'gathering','B253 Run','published',$3),
       ($4,$2,'product','B253 Jam','published',null)`,
    [GATHERING, OWNER, PAGE, SOLO],
  )
  await client.query(
    `insert into public.item_gatherings (item_id, starts_at, host_member_id) values ($1, now() + interval '7 days', $2)`,
    [GATHERING, OWNER],
  )
  await client.query(
    `insert into public.item_locations (item_id, location_id, schedule_kind) values ($1,$2,'one_time')`,
    [GATHERING, LOCATION],
  )
  await client.query(`insert into public.item_events (item_id, event_kind, acting_member_id) values ($1,'item.created',$2)`, [
    GATHERING,
    OWNER,
  ])
  await client.query(`insert into public.page_posts (group_id, body) values ($1,'B253 hello')`, [PAGE])
  await client.query(`refresh materialized view public.discoverable_items`)
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.item_events where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.item_locations where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.item_gatherings where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.items where id = any($1)`, [ITEMS])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, STRANGER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, STRANGER]])
  await client.query(`refresh materialized view public.discoverable_items`)
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('who founded, sells or hosts, to anyone', () => {
  it.each([
    ['groups', 'founder_member_id', PAGE],
    ['items', 'member_id', GATHERING],
    ['item_gatherings', 'host_member_id', GATHERING],
  ])('%s.%s answers no caller, signed in or out', async (table, column, id) => {
    const key = table === 'item_gatherings' ? 'item_id' : 'id'
    for (const sub of [null, STRANGER, OWNER]) {
      await expect(as(sub, `select ${column} from public.${table} where ${key} = $1`, [id]), `${table} as ${sub}`)
        .rejects.toThrow(/permission denied/)
    }
  })

  it.each([
    ['groups', 'founder_member_id', PAGE, 'id'],
    ['items', 'member_id', GATHERING, 'id'],
    ['item_gatherings', 'host_member_id', GATHERING, 'item_id'],
  ])('every other column of %s still answers', async (table, column, id, key) => {
    const cols = await allColumnsBut(table, column)
    // #252: signed out, a Page's anchor is withheld too (tests/front-door-db.test.ts).
    // #293: and its phone and hours (tests/page-contact-db.test.ts).
    const anonCols =
      table === 'groups'
        ? await allColumnsBut(table, column, 'anchor_location_id', 'contact_phone', 'opening_hours', 'where_mode', 'how_to_find', 'usually_around', 'photo_purged_at')
        : cols
    expect(await as(null, `select ${anonCols} from public.${table} where ${key} = $1`, [id]), `${table} as anon`).toHaveLength(1)
    for (const sub of [STRANGER]) {
      expect(await as(sub, `select ${cols} from public.${table} where ${key} = $1`, [id]), `${table} as ${sub}`).toHaveLength(1)
    }
  })

  it("an item card names no seller: discoverable_items keeps the member id and name to itself", async () => {
    for (const col of ['member_id', 'member_display_name']) {
      await expect(as(STRANGER, `select ${col} from public.discoverable_items limit 1`)).rejects.toThrow(/permission denied/)
    }
    const cols = await allColumnsBut('discoverable_items', 'member_id', 'member_display_name')
    expect(await as(null, `select ${cols} from public.discoverable_items where item_id = $1`, [GATHERING])).toHaveLength(1)
  })

  it('venue lists name no seller', async () => {
    const hosted = await as<{ member_display_name: string | null }>(
      null,
      `select member_display_name from public.venue_hosted_items($1, $2)`,
      [LOCATION, PAGE],
    )
    expect(hosted).toEqual([{ member_display_name: null }])
    const nearby = await as<{ member_display_name: string | null }>(
      STRANGER,
      `select member_display_name from public.venue_nearby_items($1, null, 100000)`,
      [LOCATION],
    )
    expect(nearby.every((r) => r.member_display_name === null)).toBe(true)
  })

  it('the home feed names no seller', async () => {
    await expect(
      as(STRANGER, `select member_display_name from public.locality_feed_items(null, null, 5)`),
    ).resolves.toBeDefined()
  })
})

describe.skipIf(!RUNNABLE)('an item posted without a Page', () => {
  it('resolves from the handle and id in its URL, and from nothing less', async () => {
    const q = `select * from public.posted_item_id($1, $2, $3)`
    expect(await as(null, q, ['b253-owner', 'product', SOLO.slice(0, 8)])).toEqual([{ posted_item_id: SOLO }])
    expect(await as(null, q, ['b253-owner', 'product', '00000000'])).toEqual([{ posted_item_id: null }])
    expect(await as(null, q, ['b253-owner', 'gathering', GATHERING.slice(0, 8)])).toEqual([{ posted_item_id: null }])
  })

  it('no longer has a name lookup by handle', async () => {
    await expect(as(null, `select * from public.post_author_public('b253-owner')`)).rejects.toThrow(/does not exist/)
  })
})

describe.skipIf(!RUNNABLE)('an owner still reads their own', () => {
  it('Pages they founded and items they posted, and nobody else does', async () => {
    expect(await as(OWNER, `select * from public.current_member_founded_group_ids()`)).toEqual([
      { current_member_founded_group_ids: PAGE },
    ])
    expect((await as<{ current_member_item_ids: string }>(OWNER, `select * from public.current_member_item_ids()`))
      .map((r) => r.current_member_item_ids).sort()).toEqual([...ITEMS].sort())
    expect(await as(STRANGER, `select * from public.current_member_founded_group_ids()`)).toEqual([])
    expect(await as(STRANGER, `select * from public.current_member_item_ids()`)).toEqual([])
  })

  it("the policies that asked the founder or poster column still answer the owner", async () => {
    expect(await as(OWNER, `select 1 from public.page_posts where group_id = $1`, [PAGE])).toHaveLength(1)
    expect(await as(OWNER, `select 1 from public.item_events where item_id = $1`, [GATHERING])).toHaveLength(1)
    await expect(as(OWNER, `select 1 from public.group_category_suggestions where group_id = $1`, [PAGE])).resolves.toBeDefined()
    await expect(as(OWNER, `select 1 from public.page_tags where group_id = $1`, [PAGE])).resolves.toBeDefined()
  })

  it('and none of them errors for a stranger', async () => {
    expect(await as(STRANGER, `select 1 from public.item_events where item_id = $1`, [GATHERING])).toHaveLength(0)
    await expect(as(STRANGER, `select 1 from public.page_posts where group_id = $1`, [PAGE])).resolves.toBeDefined()
    await expect(as(null, `select 1 from public.page_posts where group_id = $1`, [PAGE])).resolves.toBeDefined()
  })
})
