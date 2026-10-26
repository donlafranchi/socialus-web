import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #693 — F103 criterion 1: a market is a row; every US county is its own waiting
// market by default; moving a county or subdivision is one row.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the Sacramento market is rows, the Tahoe basin waits, and any other county is its own waiting market',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

// TIGER county subdivisions (Census 2023 Gazetteer): Placer's Lake Tahoe CCD, El Dorado's South Lake Tahoe CCD.
const PLACER = '06061'
const EL_DORADO = '06017'
const LAKE_TAHOE_CCD = '0606191550'
const SOUTH_LAKE_TAHOE_CCD = '0601793160'
const PLACERVILLE_CCD = '0601792490'

let pool: Pool
let client: PoolClient

const key = async (county: string | null, cousub: string | null = null) =>
  (await client.query(`select public.market_key($1, $2) as k`, [county, cousub])).rows[0].k as string | null

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

describe.skipIf(!RUNNABLE)('#693 — F103.1 the market is a row', () => {
  // [guards F103.1 partial: the Sacramento market and its members]
  it('Sacramento is open and holds Sacramento, Yolo, Placer and El Dorado whole', async () => {
    const m = (await client.query(`select id, is_open, msa_code from public.markets where slug = 'sacramento'`)).rows[0]
    expect(m.is_open).toBe(true)
    expect(m.msa_code).toBe('40900')
    const members = await client.query(
      `select county_fips from public.market_members where market_id = $1 and cousub_geoid is null order by county_fips`,
      [m.id],
    )
    expect(members.rows.map((r) => r.county_fips)).toEqual(['06017', '06061', '06067', '06113'])
  })

  // [guards F103.1 partial: the Tahoe basin is outside Sacramento and forms a waiting market]
  it('the Tahoe subdivisions of Placer and El Dorado are their own market, waiting', async () => {
    expect(await key(PLACER, LAKE_TAHOE_CCD)).toBe('tahoe')
    expect(await key(EL_DORADO, SOUTH_LAKE_TAHOE_CCD)).toBe('tahoe')
    const t = (await client.query(`select is_open from public.markets where slug = 'tahoe'`)).rows[0]
    expect(t.is_open).toBe(false)
    expect(await key(PLACER, '0606192660')).toBe('sacramento') // Roseville CCD
    expect(await key(EL_DORADO, PLACERVILLE_CCD)).toBe('sacramento')
    expect(await key(PLACER)).toBe('sacramento')
  })

  // [guards F103.1 partial: any US county resolves to exactly one market with no extra rows]
  it('any other county is its own waiting market with no rows behind it', async () => {
    const before = (await client.query(`select (select count(*) from public.markets) + (select count(*) from public.market_members) as n`)).rows[0].n
    expect(await key('06115')).toBe('county-06115') // Yuba
    expect(await key('48201')).toBe('county-48201') // Harris, TX
    expect(await key('06115', '0611590000')).toBe('county-06115')
    expect((await client.query(`select (select count(*) from public.markets) + (select count(*) from public.market_members) as n`)).rows[0].n).toBe(before)
  })

  it('a malformed county resolves to nothing', async () => {
    expect(await key('6115')).toBeNull()
    expect(await key(null)).toBeNull()
  })

  // [guards F103.1 partial: moving a member between markets is one row change]
  it('moving a county between markets is one row, no deploy', async () => {
    await client.query('begin')
    try {
      const tahoe = (await client.query(`select id from public.markets where slug = 'tahoe'`)).rows[0].id
      const r = await client.query(`update public.market_members set market_id = $1 where county_fips = '06113' and cousub_geoid is null`, [tahoe])
      expect(r.rowCount).toBe(1)
      expect(await key('06113')).toBe('tahoe')
    } finally {
      await client.query('rollback')
    }
    expect(await key('06113')).toBe('sacramento')
  })

  it('a county or subdivision belongs to exactly one market', async () => {
    const tahoe = (await client.query(`select id from public.markets where slug = 'tahoe'`)).rows[0].id
    await expect(client.query(`insert into public.market_members (market_id, county_fips) values ($1, '06113')`, [tahoe])).rejects.toThrow(/duplicate|unique/i)
    await expect(
      client.query(`insert into public.market_members (market_id, county_fips, cousub_geoid) values ($1, '06061', $2)`, [tahoe, LAKE_TAHOE_CCD]),
    ).rejects.toThrow(/duplicate|unique/i)
  })

  it('a subdivision must lie in its county', async () => {
    const tahoe = (await client.query(`select id from public.markets where slug = 'tahoe'`)).rows[0].id
    await expect(
      client.query(`insert into public.market_members (market_id, county_fips, cousub_geoid) values ($1, '06061', '0601793160')`, [tahoe]),
    ).rejects.toThrow(/check/i)
  })

  // [guards F103.1 partial: the state is seeded from the metro, which the feed keeps reading through beta]
  it('the market state is seeded from the metro, and the metro is still there', async () => {
    const r = (
      await client.query(
        `select m.creator_threshold = p.creator_threshold as t, m.hide_bar = p.hide_bar as h, m.metro_id = p.id as link
           from public.markets m join public.metro_polygons p on p.slug = 'sacramento-roseville-ca'
          where m.slug = 'sacramento'`,
      )
    ).rows[0]
    expect(r).toEqual({ t: true, h: true, link: true })
  })

  it('anyone reads the markets; nobody writes them from the client', async () => {
    await client.query('begin')
    try {
      await client.query(`set local role anon`)
      expect((await client.query(`select slug from public.markets`)).rows.length).toBeGreaterThanOrEqual(2)
      expect((await client.query(`update public.markets set is_open = true`)).rowCount).toBe(0)
      await expect(client.query(`insert into public.markets (slug, name) values ('x', 'X')`)).rejects.toThrow(/row-level|permission/i)
    } finally {
      await client.query('rollback')
    }
  })
})
