import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #349 — Don, 2026-10-04: anything in MSA 40900 counts as local. The owner's
// ZIP and the Page's pin must be in the same metro; nothing tighter. Brings
// its own county outline and ZIPs, so it runs on a fresh database.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "the local-owner test is the whole metro: a metro ZIP and a pin anywhere in the metro's counties",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a5000000-0000-4000-8000-000000000349'
const LOC = {
  folsom: 'd5000000-0000-4000-8000-000000000001', // Folsom: the old place chain had no MSA here
  foothills: 'd5000000-0000-4000-8000-000000000002', // rural El Dorado County, in no city
  sanFrancisco: 'd5000000-0000-4000-8000-000000000003', // outside the metro
}

let pool: Pool
let client: PoolClient

// A box over the metro's east side, standing in for the loaded county layer.
const COUNTY = 'SRID=4326;MULTIPOLYGON(((-121.3 38.5,-120.0 38.5,-120.0 39.0,-121.3 39.0,-121.3 38.5)))'
const ZIP = { metro: '00349', elsewhere: '00350' }

const proximal = async (zip: string, loc: string) =>
  (await client.query<{ ok: boolean }>(`select public.zip_is_proximal_to_location($1, $2) as ok`, [zip, loc])).rows[0]!.ok

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, county_fips, msa_code, source, source_url, licence, vintage)
     values ('county', 'test-349', 'Test county', $1::geography, st_pointonsurface($1::geometry)::geography, '06', '017', '40900', 'test', 'https://example.test', 'test', 'test')
     on conflict (layer, source_id) do nothing`,
    [COUNTY],
  )
  await client.query(
    `insert into public.zip_metro_crosswalk (zip, msa_code, msa_name, state, source)
     values ($1, '40900', 'Sacramento-Roseville-Folsom, CA', 'CA', 'test'), ($2, '41860', 'San Francisco-Oakland, CA', 'CA', 'test')
     on conflict (zip) do nothing`,
    [ZIP.metro, ZIP.elsewhere],
  )
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b349@test.invalid','x',now(),now(),now())
     on conflict do nothing`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b349','b349') on conflict do nothing`, [OWNER])
  for (const [id, lng, lat] of [[LOC.folsom, -121.176, 38.678], [LOC.foothills, -120.62, 38.75], [LOC.sanFrancisco, -122.42, 37.77]] as const) {
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1, $2, 'permanent', 'b349', $3, st_setsrid(st_makepoint($4, $5), 4326)::geography)
       on conflict (id) do nothing`,
      [id, OWNER, `b349-${id.slice(-1)}`, lng, lat],
    )
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.locations where member_id = $1`, [OWNER])
  await client.query(`delete from public.boundaries where source_id = 'test-349'`)
  await client.query(`delete from public.zip_metro_crosswalk where zip = any($1)`, [[ZIP.metro, ZIP.elsewhere]])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

describe.runIf(RUNNABLE)('#349 — local means the metro', () => {
  it('a metro ZIP and a Folsom pin are local', async () => {
    expect(await proximal(ZIP.metro, LOC.folsom)).toBe(true)
  })

  it('a pin in the countryside, in no city, still counts', async () => {
    expect(await proximal(ZIP.metro, LOC.foothills)).toBe(true)
  })

  it('a pin outside the metro does not', async () => {
    expect(await proximal(ZIP.metro, LOC.sanFrancisco)).toBe(false)
  })

  it('a ZIP outside the metro does not', async () => {
    expect(await proximal(ZIP.elsewhere, LOC.folsom)).toBe(false)
  })
})
