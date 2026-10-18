import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #843 — F076 criterion 1: every US zip resolves to a market, open or waiting, and nobody picks one.
// Read-only: it asks the zip and county tables what each resolves to, all of them at once.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'every US zip and every county resolves to exactly one market, open or waiting',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

let pool: Pool
let client: PoolClient
const one = async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0] as T

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
})

afterAll(async () => {
  if (!RUNNABLE) return
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#843 — F076.1 every US zip resolves to a market', () => {
  // [guards F076.1]
  it('every zip and every county resolves to exactly one market, open or waiting, that has a name; nothing is picked from a list', async () => {
    // National: every ZCTA, in every state, DC and Puerto Rico.
    const zips = await one<{ n: number; states: number }>(
      `select count(*)::int as n, count(distinct c.state)::int as states from public.zip_county z join public.counties c on c.fips = z.county_fips`,
    )
    expect(zips.n).toBeGreaterThan(33000)
    expect(zips.states).toBeGreaterThanOrEqual(52)

    // Every zip: a market key, and a market behind it (a named market, or a real county's waiting one).
    // A zip's market is its (county, subdivision) pair's, so each pair is resolved once, through one of its
    // own zips: ~3,300 calls rather than ~33,000.
    const zipHoles = await client.query(
      `with pairs as (
         select distinct on (county_fips, cousub_geoid) zip, county_fips, cousub_geoid
           from public.zip_county order by county_fips, cousub_geoid, zip
       ), k as (
         select zip, public.zip_market_key(zip) as key, public.market_key(county_fips, cousub_geoid) as pair_key from pairs
       )
       select zip, key, pair_key from k
        where key is null or key is distinct from pair_key
           or not (exists (select 1 from public.markets m where m.slug = k.key)
                   or exists (select 1 from public.counties c where c.fips = substr(k.key, 8) and k.key like 'county-%'))
        limit 5`,
    )
    expect(zipHoles.rows, 'zips with no market').toEqual([])

    // Every county, whole: the same, so a county no zip happens to name still has a market.
    const countyHoles = await client.query(
      `select c.fips, k.key from public.counties c cross join lateral (select public.market_key(c.fips) as key) k
        where k.key is null or public.market_name(k.key) is null
        limit 5`,
    )
    expect(countyHoles.rows, 'counties with no market').toEqual([])

    // Exactly one: no county (or subdivision) is a member of two markets.
    const doubled = await client.query(
      `select county_fips, cousub_geoid from public.market_members
        group by county_fips, cousub_geoid having count(distinct market_id) > 1`,
    )
    expect(doubled.rows, 'places in two markets').toEqual([])

    // Nothing is selected from a list: both ways in take a zip, and the market comes only from it.
    for (const file of ['src/app/onboarding/actions.ts', 'src/app/landing/actions.ts']) {
      const src = readFileSync(resolve(__dirname, '..', file), 'utf8')
      expect(src, file).toMatch(/marketForZip\(supabase, [\w.]*zip\)/)
      expect(src, file).not.toMatch(/input\.(metro|market)/i)
    }
  }, 60_000)
})
