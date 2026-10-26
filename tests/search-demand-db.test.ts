import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #909 — search demand: no member reads or writes the log directly, staff with metrics.view see the
// weekly top and zero-result searches, a Page's managers see only terms searched 3+ times in their area.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'search demand is staff- and manager-read only, with a minimum count of 3 for managers',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `e909${String(n).padStart(4, '0')}-0000-4000-8000-000000000909`
const ANALYST = id(1), OWNER = id(2), STRANGER = id(3)
const MEMBERS = [ANALYST, OWNER, STRANGER]
const GROUP = id(20), LOC = id(30), TAG = id(40)
const Q = ['zz909 sourdough bread', 'zz909 sourdough bread', 'zz909 sourdough bread', 'zz909 sourdough', 'zz909 sourdough', 'zz909 ferret food', 'zz909 ferret food', 'zz909 ferret food', 'zz909 lone search']

let pool: Pool
let client: PoolClient
let metroId: string

async function as<T>(sub: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

async function cleanup() {
  await client.query(`delete from public.search_demand where query like 'zz909%'`)
  await client.query(`delete from public.page_tags where group_id = $1`, [GROUP])
  await client.query(`delete from public.tags where id = $1`, [TAG])
  await client.query(`delete from public.group_memberships where group_id = $1`, [GROUP])
  await client.query(`delete from public.groups where id = $1`, [GROUP])
  await client.query(`delete from public.locations where id = $1`, [LOC])
  await client.query(`delete from public.staff_assignments where member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.members where id = any($1)`, [MEMBERS])
  await client.query(`delete from auth.users where id = any($1)`, [MEMBERS])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const m of MEMBERS) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [m, `${m.slice(0, 8)}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [m, `u${m.slice(0, 8)}`])
  }
  await client.query(`insert into public.staff_assignments (member_id, role) values ($1,'analyst')`, [ANALYST])
  const metro = (await client.query(
    `select m.id, st_x(s.centroid::geometry) lng, st_y(s.centroid::geometry) lat from public.metro_polygons m
       join public.places s on s.kind = 'city' and s.display_name = 'Sacramento' and s.deleted_at is null
      where st_intersects(m.geography, s.centroid) limit 1`,
  )).rows[0]
  metroId = metro.id
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography, discoverability)
     values ($1,$2,'permanent','T909','t909-loc', st_setsrid(st_makepoint($3,$4),4326)::geography,'listed')`,
    [LOC, OWNER, metro.lng, metro.lat],
  )
  await client.query(
    `insert into public.groups (id, kind, purpose, name, slug, founder_member_id, lifecycle_state, discoverability, anchor_location_id)
     values ($1,'group','gather','T909 bakery','t909-g',$2,'active','listed',$3)`,
    [GROUP, OWNER, LOC],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward') on conflict do nothing`,
    [GROUP, OWNER],
  )
  await client.query(`insert into public.tags (id, label, normalized, created_by) values ($1,'zz909 sourdough','zz909 sourdough',$2)`, [TAG, OWNER])
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1,$2)`, [GROUP, TAG])
  for (const q of Q) {
    await client.query(`insert into public.search_demand (query, metro_id, result_count) values ($1,$2,$3)`, [q, metroId, q.includes('ferret') ? 0 : 4])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#909 — search demand', () => {
  it('a new member shares searches by default', async () => {
    const r = await client.query(`select search_sharing from public.members where id = $1`, [STRANGER])
    expect(r.rows[0].search_sharing).toBe(true)
  })

  it('no member, signed in or out, reads or writes the log or the dedupe keys directly', async () => {
    for (const sub of [null, STRANGER, ANALYST]) {
      await expect(as(sub, `select * from public.search_demand limit 1`)).rejects.toThrow(/permission denied/)
      await expect(as(sub, `insert into public.search_demand (query, result_count) values ('zz909 x', 1)`)).rejects.toThrow(/permission denied/)
      await expect(as(sub, `select * from public.search_demand_seen limit 1`)).rejects.toThrow(/permission denied/)
    }
  })

  it('stores no member column at all', async () => {
    const cols = (await client.query(`select column_name from information_schema.columns where table_schema='public' and table_name='search_demand'`)).rows.map((r) => r.column_name)
    expect(cols.some((c: string) => /member|user|session/.test(c))).toBe(false)
  })

  it('staff with metrics.view see the top and zero-result searches this week; anyone else sees nothing', async () => {
    type Row = { list: string; query: string; searches: number }
    const staff = (await as<Row>(ANALYST, `select * from public.admin_search_demand(1, 50)`)).filter((r) => r.query.startsWith('zz909'))
    expect(staff).toContainEqual(expect.objectContaining({ list: 'top', query: 'zz909 sourdough bread', searches: 3 }))
    expect(staff).toContainEqual(expect.objectContaining({ list: 'zero', query: 'zz909 ferret food', searches: 3 }))
    expect(staff.some((r) => r.list === 'zero' && r.query.includes('sourdough'))).toBe(false)
    expect(await as(STRANGER, `select * from public.admin_search_demand(1, 50)`)).toEqual([])
    expect(await as(null, `select * from public.admin_search_demand(1, 50)`)).toEqual([])
  })

  it("a Page's manager sees terms in the area searched 3+ times: those fitting the Page's tags, and those that found nothing", async () => {
    type Row = { list: string; query: string; searches: number }
    const rows = (await as<Row>(OWNER, `select * from public.page_search_demand($1)`, [GROUP])).filter((r) => r.query.startsWith('zz909'))
    expect(rows).toContainEqual({ list: 'fit', query: 'zz909 sourdough bread', searches: 3 })
    expect(rows).toContainEqual({ list: 'zero', query: 'zz909 ferret food', searches: 3 })
    // Searched twice: below the minimum. Searched once: never shown.
    expect(rows.some((r) => r.query === 'zz909 sourdough' || r.query === 'zz909 lone search')).toBe(false)
  })

  it('anyone who does not manage the Page sees nothing', async () => {
    expect(await as(STRANGER, `select * from public.page_search_demand($1)`, [GROUP])).toEqual([])
    expect(await as(ANALYST, `select * from public.page_search_demand($1)`, [GROUP])).toEqual([])
    expect(await as(null, `select * from public.page_search_demand($1)`, [GROUP])).toEqual([])
  })
})
