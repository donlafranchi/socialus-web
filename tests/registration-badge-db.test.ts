import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #246 — a business registration is collected and never displayed (Don,
// 2026-09-29). The public artifact is the "Claimed local owner" badge, a
// boolean; the legal name, zip and state are for the member who registered.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a business registration's details reach only its member, and the badge still resolves",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000246'
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000246'
const PAGE = 'cccccccc-0000-4000-8000-000000000246'
const BARE_PAGE = 'dddddddd-0000-4000-8000-000000000246'
const LOCATION = 'eeeeeeee-0000-4000-8000-000000000246'

let pool: Pool
let client: PoolClient

async function as<T>(role: 'anon' | 'authenticated', sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${role}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  const { rows } = await client.query<{ zip: string; msa_code: string; place_id: string }>(
    `select zc.zip, zc.msa_code, pl.id as place_id
       from public.zip_metro_crosswalk zc join public.places pl on pl.msa_code = zc.msa_code
      limit 1`,
  )
  const { zip, msa_code, place_id } = rows[0]
  // #349 — "local" is the metro whose county outline covers the pin. A fresh
  // database has no boundary layers loaded, so the test brings one.
  await client.query(
    `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, county_fips, msa_code, source, source_url, licence, vintage)
     values ('county', 'test-246', 'Test county',
             'SRID=4326;MULTIPOLYGON(((-121.7 38.4,-121.3 38.4,-121.3 38.8,-121.7 38.8,-121.7 38.4)))'::geography,
             'SRID=4326;POINT(-121.5 38.6)'::geography, '06', '067', $1, 'test', 'https://example.test', 'test', 'test')
     on conflict (layer, source_id) do nothing`,
    [msa_code],
  )
  for (const [id, h] of [[OWNER, 'b246-owner'], [OTHER, 'b246-other']]) {
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
     values ($1,$2,'permanent','B246 Shop','b246-shop', ST_GeogFromText('POINT(-121.5 38.6)'), $3)`,
    [LOCATION, OWNER, place_id],
  )
  for (const [id, slug] of [[PAGE, 'b246-bakery'], [BARE_PAGE, 'b246-bare']]) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business',$2,$2,'active','listed',$3,$4)`,
      [id, slug, OWNER, LOCATION],
    )
  }
  await client.query(
    `insert into public.member_business_jurisdictions
       (member_id, group_id, zip, state, legal_entity_name, verification_source)
     values ($1,$2,$3,'CA','B246 Bakery LLC','self_attested')`,
    [OWNER, PAGE, zip],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.member_business_jurisdictions where member_id = $1`, [OWNER])
  await client.query(`delete from public.group_events where group_id in ($1,$2)`, [PAGE, BARE_PAGE])
  await client.query(`delete from public.groups where id in ($1,$2)`, [PAGE, BARE_PAGE])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.boundaries where source_id = 'test-246'`)
  await client.query(`delete from public.member_events where member_id in ($1,$2)`, [OWNER, OTHER])
  await client.query(`delete from public.members where id in ($1,$2)`, [OWNER, OTHER])
  await client.query(`delete from auth.users where id in ($1,$2)`, [OWNER, OTHER])
  client.release()
  await pool.end()
})

const DETAILS = `select legal_entity_name, zip, state, member_id from public.member_business_jurisdictions where group_id = $1`

describe.skipIf(!RUNNABLE)('#246 — business registration: collected, never displayed', () => {
  it('a stranger cannot read a registration', async () => {
    await expect(as('anon', null, DETAILS, [PAGE])).rejects.toThrow(/permission denied/)
  })

  it('another signed-in member cannot read it either', async () => {
    await expect(as('authenticated', OTHER, DETAILS, [PAGE])).resolves.toHaveLength(0)
  })

  it('the member who registered still reads their own', async () => {
    const rows = await as<{ legal_entity_name: string }>('authenticated', OWNER, DETAILS, [PAGE])
    expect(rows.map((r) => r.legal_entity_name)).toEqual(['B246 Bakery LLC'])
  })

  it('the badge resolves for a stranger, true where a nearby registration is on file', async () => {
    const [on] = await as<{ b: boolean }>('anon', null, `select public.page_local_owner_badge($1) as b`, [PAGE])
    const [off] = await as<{ b: boolean }>('anon', null, `select public.page_local_owner_badge($1) as b`, [BARE_PAGE])
    expect(on.b).toBe(true)
    expect(off.b).toBe(false)
  })

  it('the badge can only ever return a boolean', async () => {
    const { rows } = await client.query<{ result: string }>(
      `select pg_get_function_result('public.page_local_owner_badge(uuid)'::regprocedure) as result`,
    )
    expect(rows[0].result).toBe('boolean')
  })
})
