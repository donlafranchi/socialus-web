import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #922 — Explore opens on a full screen nearby: browse_nearby starts at the inner ring (15 minutes, a drive
// minute taken as a straight-line km) and widens 15 minutes at a time until p_target things are on this week,
// capped at p_cap_minutes. p_minutes sets the reach exactly, past the cap. Signed out the rings start from the
// market's principal city, and nothing about where a Page is reaches the reader.
// Every case seeds inside a transaction and rolls back.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'Explore widens ring by ring to a full screen nearby, capped at an hour',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a9220000-0000-4000-8000-000000000922'
const ZIP = '99922'
const TOWN = '0699922'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
// Placerville: no seeded Page within an hour of it.
const O = { lon: -120.8, lat: 38.73 }
const KM_LON = 86.9 // km per degree of longitude at this latitude
const west = (km: number) => `POINT(${(O.lon - km / KM_LON).toFixed(5)} ${O.lat})`
const PAGES: [string, number][] = [
  ['b922-near-a', 10], ['b922-near-b', 10], ['b922-mid-a', 25], ['b922-mid-b', 25], ['b922-far', 50], ['b922-beyond', 70],
]
const DAY = 86_400_000

let pool: Pool
let client: PoolClient

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

const square = (lon: number, lat: number) =>
  `MULTIPOLYGON(((${lon - 0.01} ${lat - 0.01},${lon + 0.01} ${lat - 0.01},${lon + 0.01} ${lat + 0.01},${lon - 0.01} ${lat + 0.01},${lon - 0.01} ${lat - 0.01})))`

async function boundary(sourceId: string, name: string, lon: number, lat: number) {
  await client.query(
    `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, source, source_url, licence, vintage)
     values ('place', $1, $2, ST_GeogFromText($3), ST_GeogFromText($4), '06', 'test', 'https://example.test/b922', 'test', 'test')
     on conflict do nothing`,
    [sourceId, name, square(lon, lat), `POINT(${lon} ${lat})`],
  )
}

/** The member lives in a test town at O; six Pages west of it at 10, 10, 25, 25, 50 and 70 km. */
async function seed({ postInDays = null as number | null } = {}) {
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b922@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.zip_county (zip, county_fips) values ($1, '06017') on conflict do nothing`, [ZIP])
  await client.query(`insert into public.zip_place (zip, place_geoid, place_name) values ($1, $2, 'B922 Town') on conflict do nothing`, [ZIP, TOWN])
  await boundary(TOWN, 'B922 Town', O.lon, O.lat)
  await client.query(`insert into public.members (id, handle, display_name, zip) values ($1,'b922','b922',$2)`, [MEMBER, ZIP])
  for (const [slug, km] of PAGES) {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.locations (member_id, kind, label, slug, geography)
       values ($1,'permanent',$2,$2, ST_GeogFromText($3)) returning id`,
      [MEMBER, slug, west(km)],
    )
    await client.query(
      `insert into public.groups (kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ('business',$1,$1,'active','listed',$2,$3)`,
      [slug, MEMBER, rows[0]!.id],
    )
  }
  if (postInDays !== null) {
    await client.query(
      `insert into public.page_posts (group_id, body, starts_at, lifecycle_state)
       select id, 'b922 post', $1, 'active' from public.groups where slug = 'b922-near-a'`,
      [new Date(Date.now() + postInDays * DAY).toISOString()],
    )
  }
}

async function inTx<T>(as: 'member' | 'anon', fn: () => Promise<T>, opts?: Parameters<typeof seed>[0]): Promise<T> {
  await client.query('begin')
  try {
    await seed(opts)
    if (as === 'member') {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: MEMBER, role: 'authenticated' })])
      await client.query('set local role authenticated')
    } else {
      await client.query('set local role anon')
    }
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

type Row = { name: string; reach_minutes: number; reach_from: string | null; location_geography: string | null }

async function nearby(args: { target?: number; minutes?: number | null; weekEnd?: string | null; cap?: number } = {}) {
  const { rows } = await client.query<Row>(
    `select name, reach_minutes, reach_from, location_geography from public.browse_nearby(
       p_metro_id => ${METRO}, p_result_kinds => null, p_week_end => $1, p_minutes => $2, p_target => $3, p_cap_minutes => $4)`,
    [args.weekEnd ?? null, args.minutes ?? null, args.target ?? 24, args.cap ?? 60],
  )
  return { minutes: rows[0]?.reach_minutes ?? null, from: rows[0]?.reach_from, names: rows.map((r) => r.name).filter((n) => n.startsWith('b922')).sort(), rows }
}

describe.skipIf(!RUNNABLE)('browse_nearby — a full screen nearby (#922)', () => {
  it('stops at the first ring that holds the target', async () => {
    const r = await inTx('member', () => nearby({ target: 2 }))
    expect(r.minutes).toBe(15)
    expect(r.names).toEqual(['b922-near-a', 'b922-near-b'])
  })

  it('widens a ring at a time until the target is reached', async () => {
    const r = await inTx('member', () => nearby({ target: 3 }))
    expect(r.minutes).toBe(30)
    expect(r.names).toEqual(['b922-mid-a', 'b922-mid-b', 'b922-near-a', 'b922-near-b'])
  })

  it('never widens past the cap, about an hour', async () => {
    const r = await inTx('member', () => nearby({ target: 100 }))
    expect(r.minutes).toBe(60)
    expect(r.names).toContain('b922-far')
    expect(r.names).not.toContain('b922-beyond')
  })

  it('goes past the cap when the member asks for a reach', async () => {
    const r = await inTx('member', () => nearby({ minutes: 90 }))
    expect(r.minutes).toBe(90)
    expect(r.names).toContain('b922-beyond')
  })

  it('counts only what is on this week toward the screen', async () => {
    const weekEnd = new Date(Date.now() + 7 * DAY).toISOString()
    // Two Pages and one post in the inner ring: the post counts while it is this week, not when it is next month.
    expect((await inTx('member', () => nearby({ target: 3, weekEnd }), { postInDays: 2 })).minutes).toBe(15)
    expect((await inTx('member', () => nearby({ target: 3, weekEnd }), { postInDays: 30 })).minutes).toBe(30)
  })

  it('starts from the member’s home town and names no town for it (“you”)', async () => {
    const r = await inTx('member', async () => {
      await client.query('reset role')
      await boundary('0664000', 'Sacramento', -121.4681605, 38.5676936)
      await client.query('set local role authenticated')
      return nearby({ target: 2 })
    })
    expect(r.from).toBeNull()
    expect(r.names).toEqual(['b922-near-a', 'b922-near-b'])
  })

  it('signed out, starts from the market’s principal city, names it, and carries no location', async () => {
    const r = await inTx('anon', async () => {
      await client.query('reset role')
      await boundary('0664000', 'Sacramento', -121.4681605, 38.5676936)
      await client.query('set local role anon')
      return nearby({ target: 2 })
    })
    expect(r.from).toBe('Sacramento')
    // Placerville is about 60 km from Sacramento: the member's inner ring is not the visitor's.
    expect(r.names).not.toContain('b922-near-a')
    expect(r.rows.every((x) => x.location_geography === null)).toBe(true)
  })

  it('a member whose home town lies outside the market starts from its principal city', async () => {
    const r = await inTx('member', async () => {
      await client.query('reset role')
      await client.query(`update public.boundaries set centroid = ST_GeogFromText('POINT(-118.24 34.05)') where layer = 'place' and source_id = $1`, [TOWN])
      await boundary('0664000', 'Sacramento', -121.4681605, 38.5676936)
      await client.query('set local role authenticated')
      return nearby({ target: 2 })
    })
    expect(r.from).toBe('Sacramento')
  })

  it('browse_feed takes no origin: the reach is measured only from the vantage the database decides', async () => {
    const { rows } = await client.query<{ args: string }>(
      `select pg_get_function_identity_arguments('public.browse_feed'::regproc) as args`,
    )
    expect(rows[0]!.args).toContain('p_reach_m double precision')
    expect(rows[0]!.args).not.toMatch(/geography|geometry|p_origin|p_lat|p_lon/)
  })
})
