import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #694 — F103 criteria 2 and 3: a zip resolves to exactly one market, the same every time;
// the zip decides, nobody picks.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a zip anywhere in the US resolves to one market, and a waiting market has a row to wait on',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

let pool: Pool
let client: PoolClient
const one = async <T = string | null>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0] as T
const zipKey = async (zip: string) => (await one<{ k: string | null }>(`select public.zip_market_key($1) as k`, [zip])).k

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.metro_polygons where code_kind = 'market' and slug = 'county-06115'`)
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#694 — F103.2 the zip resolves to one market', () => {
  // [guards F103.2 partial: zip → county → market, and subdivision inside a split county]
  it('resolves the worked examples', async () => {
    expect(await zipKey('95746')).toBe('sacramento') // Granite Bay, Placer outside the Tahoe basin
    expect(await zipKey('95819')).toBe('sacramento') // Sacramento
    expect(await zipKey('95616')).toBe('sacramento') // Davis, Yolo
    expect(await zipKey('96150')).toBe('tahoe') // South Lake Tahoe, El Dorado
    expect(await zipKey('96145')).toBe('tahoe') // Tahoe City, Placer
    expect(await zipKey('95667')).toBe('sacramento') // Placerville, El Dorado
    expect(await zipKey('95901')).toBe('county-06115') // Marysville, Yuba: its own waiting market
    expect(await zipKey('10001')).toBe('county-36061') // New York County
  })

  // bug #905: Connecticut's zips resolve to its planning regions (the counties the 2023 gazetteer names).
  it('resolves Connecticut zips to their planning region', async () => {
    expect(await zipKey('06103')).toBe('county-09110') // Hartford, Capitol
    expect(await zipKey('06510')).toBe('county-09170') // New Haven, South Central
    expect(await zipKey('06901')).toBe('county-09190') // Stamford, Western
  })

  // [guards F103.2 partial: the same zip always gives the same market]
  it('is deterministic', async () => {
    for (const zip of ['95746', '96150', '95901', '77001']) expect(await zipKey(zip)).toBe(await zipKey(zip))
  })

  // [guards F103.2 partial: a zip the table does not know has no market]
  it('a zip nobody knows has no market', async () => {
    expect(await zipKey('00000')).toBeNull()
    expect(await zipKey('9574')).toBeNull()
  })

  // [guards F103.2 partial: where a zip spans counties the largest-area county is taken and marked a guess]
  it('marks a zip that spans counties as a guess, and a one-county zip as not', async () => {
    expect((await one<{ guess: boolean }>(`select guess from public.zip_county where zip = '00601'`)).guess).toBe(true)
    expect((await one<{ guess: boolean }>(`select guess from public.zip_county where zip = '95819'`)).guess).toBe(false)
    const n = (await one<{ n: number }>(`select count(*)::int as n from public.zip_county where guess`)).n
    expect(n).toBeGreaterThan(1000)
  })

  it('every zip points at a real county, and the table is national', async () => {
    const n = (await one<{ n: number }>(`select count(*)::int as n from public.zip_county`)).n
    expect(n).toBeGreaterThan(33000)
    const orphans = (await one<{ n: number }>(`select count(*)::int as n from public.zip_county z left join public.counties c on c.fips = z.county_fips where c.fips is null`)).n
    expect(orphans).toBe(0)
  })

  it('names the market in plain words', async () => {
    expect((await one<{ n: string }>(`select public.market_name('county-06115') as n`)).n).toBe('Yuba County, CA')
    expect((await one<{ n: string }>(`select public.market_name('sacramento') as n`)).n).toBe('Sacramento')
    expect((await one<{ n: string }>(`select public.market_name('tahoe') as n`)).n).toBe('Lake Tahoe')
    expect((await one<{ n: string | null }>(`select public.market_name('bogus') as n`)).n).toBeNull()
  })
})

describe.skipIf(!RUNNABLE)('#694 — F103.3 a waiting market has a row to wait on', () => {
  // [guards F103.3 partial: the waitlist keys by market; the row is made the first time someone waits]
  it('makes the waiting row for a county market once, and only for a real county', async () => {
    const before = (await one<{ n: number }>(`select count(*)::int as n from public.metro_polygons`)).n
    const a = (await one<{ id: string }>(`select public.market_metro('county-06115') as id`)).id
    const b = (await one<{ id: string }>(`select public.market_metro('county-06115') as id`)).id
    expect(a).toBe(b)
    expect((await one<{ n: number }>(`select count(*)::int as n from public.metro_polygons`)).n).toBe(before + 1)
    const row = await one<{ name: string; is_open: boolean; code_kind: string }>(`select name, is_open, code_kind from public.metro_polygons where id = $1`, [a])
    expect(row).toEqual({ name: 'Yuba County, CA', is_open: false, code_kind: 'market' })
    expect((await one<{ id: string | null }>(`select public.market_metro('county-99999') as id`)).id).toBeNull()
    expect((await one<{ id: string | null }>(`select public.market_metro('bogus') as id`)).id).toBeNull()
  })

  it('Sacramento is the metro the feed already reads, and Tahoe has its own waiting row', async () => {
    const sac = (await one<{ id: string }>(`select public.market_metro('sacramento') as id`)).id
    expect(sac).toBe((await one<{ id: string }>(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).id)
    const tahoe = await one<{ is_open: boolean; name: string }>(`select p.is_open, p.name from public.metro_polygons p where p.id = public.market_metro('tahoe')`)
    expect(tahoe).toEqual({ is_open: false, name: 'Lake Tahoe' })
  })

  it('anyone may ask, nobody may write the table directly', async () => {
    await client.query('begin')
    try {
      await client.query(`set local role anon`)
      expect((await one<{ k: string }>(`select public.zip_market_key('95901') as k`)).k).toBe('county-06115')
      await expect(client.query(`insert into public.zip_county (zip, county_fips) values ('00001', '06115')`)).rejects.toThrow(/row-level|permission/i)
    } finally {
      await client.query('rollback')
    }
  })
})
