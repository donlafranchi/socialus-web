import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { searchNeighborhoods } from '../src/lib/places/neighborhood-search'

// #413 — "Or type a neighbourhood" finds the metro's neighbourhoods by name,
// starts-with first, and gives each a point to put the pin on.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'typing a neighbourhood finds the metro’s neighbourhoods by name, with a point for the pin',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const square = (x: number, y: number) =>
  `SRID=4326;MULTIPOLYGON(((${x} ${y},${x + 0.01} ${y},${x + 0.01} ${y + 0.01},${x} ${y + 0.01},${x} ${y})))`

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query('begin')
  const rows: [string, string, string, string, number, number, boolean][] = [
    ['test-413-a', 'Zqx Park', 'neighborhood', '40900', -121.5, 38.5, false],
    ['test-413-b', 'Old Zqx Heights', 'neighborhood', '40900', -121.4, 38.5, false],
    ['test-413-c', 'Zqx Elsewhere', 'neighborhood', '99999', -120.0, 37.0, false],
    ['test-413-d', 'Zqx Town', 'city', '40900', -121.3, 38.5, false],
    ['test-413-e', 'Zqx Gone', 'neighborhood', '40900', -121.2, 38.5, true],
  ]
  for (const [slug, name, kind, msa, x, y, gone] of rows) {
    await client.query(
      `insert into public.places (slug, display_name, kind, msa_code, geography, deleted_at, parent_id)
       values ($1, $2, $3, $4, $5::geography, case when $6 then now() end,
               (select id from public.places where kind = 'state' limit 1))`,
      [slug, name, kind, msa, square(x, y), gone],
    )
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query('rollback')
  client.release()
  await pool.end()
})

describe.runIf(RUNNABLE)('#413 — or type a neighbourhood', () => {
  it('finds the metro’s live neighbourhoods by any part of the name, any case, starts-with first', async () => {
    const found = await searchNeighborhoods(client, 'zqx')
    expect(found.map((n) => n.name)).toEqual(['Zqx Park', 'Old Zqx Heights'])
  })

  it('gives each one a point inside it for the pin', async () => {
    const [park] = await searchNeighborhoods(client, 'Zqx Park')
    expect(park!.placeId).toMatch(/^[0-9a-f-]{36}$/)
    const [lng, lat] = park!.centroid
    expect(lng).toBeGreaterThan(-121.5)
    expect(lng).toBeLessThan(-121.49)
    expect(lat).toBeGreaterThan(38.5)
    expect(lat).toBeLessThan(38.51)
  })

  it('stays inside the metro asked for', async () => {
    expect((await searchNeighborhoods(client, 'zqx', '99999')).map((n) => n.name)).toEqual(['Zqx Elsewhere'])
  })

  it('treats the typed text as text, not a pattern, and finds nothing for nothing', async () => {
    expect(await searchNeighborhoods(client, '%')).toEqual([])
    expect(await searchNeighborhoods(client, '  ')).toEqual([])
  })
})
