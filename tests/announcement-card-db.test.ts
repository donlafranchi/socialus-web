import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #256 (F072 criterion 3): an announcement with no address of its own reads as
// being at its Page's location, and a card says when it was posted. Signed out
// no location is sent at all (F093 criterion 8), and no post row either.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "an announcement with no address reads at its Page's location, and carries when it was posted",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a3000000-0000-4000-8000-000000000256'
const VISITOR = 'b3000000-0000-4000-8000-000000000256'
const PAGE = 'c3000000-0000-4000-8000-000000000256'
const ANCHOR = 'd3000000-0000-4000-8000-000000000256'
const HALL = 'e3000000-0000-4000-8000-000000000256'
const AT_PAGE = 'f3000000-0000-4000-8000-000000000256'
const AT_HALL = '13000000-0000-4000-8000-000000000256'
const POSTED = '2026-09-02T18:00:00.000Z'

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

type Row = { result_id: string; location_label: string | null; location_point: string | null; posted_at: Date | null }
const posts = (sub: string | null) =>
  as<Row>(
    sub,
    `select result_id, location_label, st_astext(location_geography) as location_point, posted_at
       from public.browse_feed(p_metro_id => $1, p_result_kinds => array['post'])
      where group_id = $2 order by result_id`,
    [metroId, PAGE],
  )

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  metroId = (await client.query(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).rows[0].id
  for (const [id, h] of [[OWNER, 'b256-owner'], [VISITOR, 'b256-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography) values
       ($1,$3,'permanent','The Bakery','b256-bakery', ST_GeogFromText('POINT(-121.47 38.54)')),
       ($2,$3,'permanent','Church Hall','b256-hall', ST_GeogFromText('POINT(-121.48 38.55)'))`,
    [ANCHOR, HALL, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','B256 Bakery','b256-bakery','active','listed',$2,$3)`,
    [PAGE, OWNER, ANCHOR],
  )
  await client.query(
    `insert into public.page_posts (id, group_id, body, location_id, created_at, lifecycle_state) values
       ($1,$3,'Sourdough is back',null,$5,'active'),
       ($2,$3,'Bread class',$4,$5,'active')`,
    [AT_PAGE, AT_HALL, PAGE, HALL, POSTED],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.locations where id = any($1)`, [[ANCHOR, HALL]])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, VISITOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, VISITOR]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("an announcement's place and posted date, on its card", () => {
  it("with no address of its own, it reads as being at its Page's location", async () => {
    const rows = await posts(VISITOR)
    expect(rows.find((r) => r.result_id === AT_PAGE)?.location_label).toBe('The Bakery')
  })

  it("with its own address, it reads as being there, and the map pin stays its own", async () => {
    const rows = await posts(VISITOR)
    const hall = rows.find((r) => r.result_id === AT_HALL)!
    expect(hall.location_label).toBe('Church Hall')
    expect(hall.location_point).toBe('POINT(-121.48 38.55)')
    expect(rows.find((r) => r.result_id === AT_PAGE)?.location_point).toBeNull()
  })

  it('carries when it was posted', async () => {
    const rows = await posts(VISITOR)
    expect(rows.map((r) => r.posted_at?.toISOString())).toEqual([POSTED, POSTED])
  })

  it('reaches no signed-out caller', async () => {
    expect(await posts(null)).toEqual([])
  })
})
