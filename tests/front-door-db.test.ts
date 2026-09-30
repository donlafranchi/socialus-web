import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// F093 criterion 8, amended 2026-09-30 (Don): a signed-out visitor sees a
// Page's front door — name, default photo, description, the withheld card —
// and no location, tags or founder. The Page keeps its location, which scopes
// it to the metro and places it on the map without being displayed. Tags show
// signed in only. Enforced in SQL: a signed-out caller is never sent them.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a signed-out caller receives a Page's front door and never its location or tags",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a2000000-0000-4000-8000-000000000252'
const VISITOR = 'b2000000-0000-4000-8000-000000000252'
const PAGE = 'c2000000-0000-4000-8000-000000000252'
const LOCATION = 'd2000000-0000-4000-8000-000000000252'
const TAG = 'e2000000-0000-4000-8000-000000000252'
const POINT = 'POINT(-121.4702 38.5412)' // a street in Oak Park
const METRO_SLUG = 'sacramento-roseville-ca'

let pool: Pool
let client: PoolClient
let metroId: string
let placeCentroid: string

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

type FeedRow = {
  result_id: string
  location_id: string | null
  location_label: string | null
  location_point: string | null
  tags: string[]
  place_path: string | null
  description: string | null
}

const feed = (sub: string | null, tags: string[] | null = null) =>
  as<FeedRow>(
    sub,
    `select result_id, location_id, location_label, st_astext(location_geography) as location_point,
            tags, place_path, description
       from public.browse_feed(p_metro_id => $1, p_result_kinds => array['page'], p_tags => $2)
      where result_id = $3`,
    [metroId, tags, PAGE],
  )

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  metroId = (await client.query(`select id from public.metro_polygons where slug = $1`, [METRO_SLUG])).rows[0].id
  const place = (
    await client.query(`select id, st_astext(centroid) as c from public.places where slug = 'oak-park' limit 1`)
  ).rows[0]
  placeCentroid = place.c
  for (const [id, h] of [[OWNER, 'b252-owner'], [VISITOR, 'b252-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography, place_id)
     values ($1,$2,'permanent','12 Broadway','b252-12-broadway', ST_GeogFromText($3), $4)`,
    [LOCATION, OWNER, POINT, place.id],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'interest','B252 Run Club','b252-run-club','We run.','active','listed',$2,$3)`,
    [PAGE, OWNER, LOCATION],
  )
  await client.query(
    `insert into public.tags (id, label, normalized, status, created_by) values ($1,'Running','b252-running','visible',$2)`,
    [TAG, OWNER],
  )
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1,$2)`, [PAGE, TAG])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_tags where group_id = $1`, [PAGE])
  await client.query(`delete from public.tags where id = $1`, [TAG])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, VISITOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, VISITOR]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("a Page's front door, signed out", () => {
  // [guards F093.8 partial: the database half; the Page and card rendering are checked in unit tests]
  it('Explore returns the Page with its description, and no location, address or tags', async () => {
    const rows = await feed(null)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ location_id: null, location_label: null, tags: [], description: 'We run.' })
  })

  it("places the Page on the map at its Place, never at its stored point", async () => {
    const [row] = await feed(null)
    expect(row.location_point).not.toBe(POINT)
    expect(row.location_point).toBe(placeCentroid)
  })

  it('a tag filter cannot be used to learn a Page\'s tags', async () => {
    expect(await feed(null, ['b252-running'])).toHaveLength(1)
    expect(await feed(null, ['no-such-tag'])).toHaveLength(1)
  })

  it('no location, tag or anchor answers a signed-out caller directly', async () => {
    for (const sql of [
      `select label from public.locations where id = '${LOCATION}'`,
      `select geography from public.locations where id = '${LOCATION}'`,
      `select tag_id from public.page_tags where group_id = '${PAGE}'`,
      `select label from public.tags where id = '${TAG}'`,
      `select anchor_location_id from public.groups where id = '${PAGE}'`,
    ]) {
      await expect(as(null, sql), sql).rejects.toThrow(/permission denied/)
    }
  })

  it("every other column of a signed-out Page still answers", async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'groups'
          and column_name not in ('founder_member_id', 'anchor_location_id')`,
    )
    const cols = rows.map((r) => `"${r.column_name}"`).join(', ')
    expect(await as(null, `select ${cols} from public.groups where id = $1`, [PAGE])).toHaveLength(1)
  })

  it("a location's details answer nothing and break nothing", async () => {
    for (const t of ['location_permanent', 'location_recurring_temporary', 'location_areas']) {
      expect(await as(null, `select 1 from public.${t}`), t).toEqual([])
    }
  })

  it("the Page's URL prefix still resolves", async () => {
    const rows = await as<{ group_id: string; place_path: string | null }>(
      null,
      `select group_id, place_path from public.group_url_prefixes($1)`,
      [[PAGE]],
    )
    expect(rows.map((r) => r.group_id)).toEqual([PAGE])
  })
})

describe.skipIf(!RUNNABLE)("a Page's front door, signed in", () => {
  it('Explore returns its location, exact point and tags', async () => {
    const [row] = await feed(VISITOR)
    expect(row).toMatchObject({ location_id: LOCATION, location_label: '12 Broadway', tags: ['Running'] })
    expect(row.location_point).toBe(POINT)
  })

  it('a tag filter narrows', async () => {
    expect(await feed(VISITOR, ['b252-running'])).toHaveLength(1)
    expect(await feed(VISITOR, ['no-such-tag'])).toHaveLength(0)
  })

  it('reads the location, its tags and its anchor directly', async () => {
    expect(await as(VISITOR, `select label from public.locations where id = $1`, [LOCATION])).toHaveLength(1)
    expect(await as(VISITOR, `select tag_id from public.page_tags where group_id = $1`, [PAGE])).toHaveLength(1)
    expect(await as(VISITOR, `select anchor_location_id from public.groups where id = $1`, [PAGE])).toEqual([
      { anchor_location_id: LOCATION },
    ])
  })
})
