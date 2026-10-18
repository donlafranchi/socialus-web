// F103 criteria 1, 2 and 5, each claimed whole by one check against the real database and handlers.
// (Criterion 3 is claimed in tests/signup-zip-market-db.test.tsx; criterion 4 is #848's.)

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { memberSignupProfileSet, memberZipSet } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'markets are rows of counties across state lines, a zip resolves to one of them, and the home town follows the zip privately',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const ROOT = resolve(__dirname, '..')
const A = 'a3000000-0000-4000-8000-000000000850'
const B = 'b3000000-0000-4000-8000-000000000850'
const W = 'c3000000-0000-4000-8000-000000000850'
const PEOPLE = [A, B, W]
const PLACER = '06061'
const EL_DORADO = '06017'
const DOUGLAS_NV = '32005' // the Nevada side of the Tahoe basin

let pool: Pool
let client: PoolClient
const one = async <T>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows[0] as T
const key = async (county: string, cousub: string | null = null) => (await one<{ k: string | null }>(`select public.market_key($1, $2) as k`, [county, cousub])).k
const zipKey = async (zip: string) => (await one<{ k: string | null }>(`select public.zip_market_key($1) as k`, [zip])).k
const ctx = (actingMemberId: string): ActionContext => ({ actingMemberId, viaDelegationId: null, traceId: 'f103', db: {} as never, now: () => new Date() })
const home = async (id: string) =>
  one<{ zip: string | null; home_market_key: string | null; home_town: string | null; home_town_geoid: string | null }>(
    `select zip, home_market_key, home_town, home_town_geoid from public.members where id = $1`,
    [id],
  )
async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    return await fn()
  } finally {
    await client.query('rollback')
  }
}
async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  return inTx(async () => {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  })
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(`delete from public.member_events where acting_member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.members where id = any($1)`, [PEOPLE]) // a run that died before its afterAll
  await client.query(`delete from auth.users where id = any($1)`, [PEOPLE])
  for (const id of PEOPLE) {
    const handle = `f850-${id.slice(0, 2)}`
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${handle}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, handle])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.member_events where acting_member_id = any($1)`, [PEOPLE])
  await client.query(`delete from public.members where id = any($1)`, [PEOPLE])
  await client.query(`delete from auth.users where id = any($1)`, [PEOPLE])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('F103.1 — a market is a row of whole counties and subdivisions', () => {
  // [guards F103.1]
  it('Sacramento is four counties less two Tahoe subdivisions; every US county is in exactly one market; moving one is one row; a market may cross a state line', async () => {
    // A market is a row whose members are whole counties and, where a county is split, subdivisions.
    const sac = await one<{ id: string; is_open: boolean }>(`select id, is_open from public.markets where slug = 'sacramento'`)
    const tahoe = await one<{ id: string; is_open: boolean }>(`select id, is_open from public.markets where slug = 'tahoe'`)
    const members = async (id: string) =>
      (await client.query(`select county_fips, cousub_geoid from public.market_members where market_id = $1 order by 1, 2`, [id])).rows
    expect(await members(sac.id)).toEqual(['06017', '06061', '06067', '06113'].map((c) => ({ county_fips: c, cousub_geoid: null })))
    expect(await members(tahoe.id)).toEqual([
      { county_fips: EL_DORADO, cousub_geoid: '0601793160' },
      { county_fips: PLACER, cousub_geoid: '0606191550' },
    ])
    expect(await key(PLACER, '0606191550')).toBe('tahoe')
    expect(await key(PLACER, '0606192645')).toBe('sacramento')

    // Every US county belongs to exactly one market; one nobody drew is its own waiting market, with no row.
    const all = await one<{ n: number; unresolved: number; states: number }>(
      `select count(*)::int as n, count(*) filter (where public.market_key(fips) is null)::int as unresolved, count(distinct state)::int as states from public.counties`,
    )
    expect(all.n).toBeGreaterThan(3_100)
    expect(all.states).toBeGreaterThanOrEqual(51)
    expect(all.unresolved).toBe(0)
    expect(await key('48201')).toBe('county-48201')
    expect((await client.query(`select 1 from public.markets where slug = 'county-48201'`)).rowCount).toBe(0)
    await expect(inTx(() => client.query(`insert into public.market_members (market_id, county_fips) values ($1, '06113')`, [tahoe.id]))).rejects.toThrow(/duplicate|unique/i)

    await inTx(async () => {
      // Moving a county between markets is one row, no deploy.
      expect((await client.query(`update public.market_members set market_id = $1 where county_fips = '06113' and cousub_geoid is null`, [tahoe.id])).rowCount).toBe(1)
      expect(await key('06113')).toBe('tahoe')
      // A market's counties may lie in more than one state: the Nevada side of the basin joins Tahoe.
      await client.query(`insert into public.market_members (market_id, county_fips) values ($1, $2)`, [tahoe.id, DOUGLAS_NV])
      expect(await key(DOUGLAS_NV)).toBe('tahoe')
      expect(await zipKey('89448')).toBe('tahoe') // Zephyr Cove, NV
      expect(await zipKey('96150')).toBe('tahoe') // South Lake Tahoe, CA
      const states = await client.query(
        `select distinct c.state from public.market_members mm join public.counties c on c.fips = mm.county_fips where mm.market_id = $1 order by 1`,
        [tahoe.id],
      )
      expect(states.rows.map((r) => r.state)).toEqual(['CA', 'NV'])
    })
    expect(await key('06113')).toBe('sacramento')
    expect(await key(DOUGLAS_NV)).toBe('county-32005')
  })
})

describe.skipIf(!RUNNABLE)('F103.2 — a zip resolves to exactly one market, deterministically', () => {
  // [guards F103.2 partial: the zip → county source is the Census ZCTA file ranked by land area, not the HUD-USPS crosswalk by residential share (#849)]
  it('zip → county → market, a subdivision decides inside a split county, the same zip gives the same market, and an unknown zip is refused in the exact words', async () => {
    expect(await zipKey('95819')).toBe('sacramento') // Sacramento County
    expect(await zipKey('95616')).toBe('sacramento') // Yolo
    expect(await zipKey('95901')).toBe('county-06115') // Yuba, its own waiting market
    expect(await zipKey('10001')).toBe('county-36061') // New York County

    // Inside split Placer, two zips of one county land in two markets: the subdivision decides.
    const placer = (await client.query(`select zip, county_fips, cousub_geoid from public.zip_county where zip in ('95746', '96145') order by zip`)).rows
    expect(placer.map((r) => r.county_fips)).toEqual([PLACER, PLACER])
    expect(placer[0].cousub_geoid).not.toBe(placer[1].cousub_geoid)
    expect(await zipKey('95746')).toBe('sacramento')
    expect(await zipKey('96145')).toBe('tahoe')
    // Outside a split county no subdivision is kept, so nothing but the county decides.
    expect((await one<{ c: string | null }>(`select cousub_geoid as c from public.zip_county where zip = '95819'`)).c).toBeNull()

    // One county per zip (largest share wins, a spanning zip marked a guess), and the same answer every time.
    expect((await one<{ n: number }>(`select count(*)::int - count(distinct zip)::int as n from public.zip_county`)).n).toBe(0)
    expect((await one<{ guess: boolean }>(`select guess from public.zip_county where zip = '00601'`)).guess).toBe(true)
    const again = await one<{ n: number }>(
      `select count(*)::int as n from (select zip from public.zip_county order by zip limit 200) z where public.zip_market_key(z.zip) is distinct from public.zip_market_key(z.zip)`,
    )
    expect(again.n).toBe(0)
    for (const zip of ['95746', '96145', '95901']) expect(await zipKey(zip)).toBe(await zipKey(zip))

    // An unknown zip has no market and is refused in the exact words, nothing written.
    expect(await zipKey('00000')).toBeNull()
    await expect(memberZipSet(ctx(B), { zip: '00000' })).rejects.toThrow("We don't recognize that zip, try again.")
    expect((await home(B)).zip).toBeNull()
  })
})

describe.skipIf(!RUNNABLE)('F103.5 — the home town is the Place or the county remainder, follows the zip, and stays private', () => {
  function namesHomeTown(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return namesHomeTown(p)
      return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && /home_town|homeTown/.test(readFileSync(p, 'utf8')) ? [p.slice(ROOT.length + 1)] : []
    })
  }

  // [guards F103.5 partial: a waiting member gets a home town from backfill_home_towns, but nothing opens a market and calls it yet (#616)]
  it('signup stores the Place, a zip in no Place gives the county remainder, a move re-resolves it, a waiting member gets one the day the market opens, and no one else reads it', async () => {
    const signup = { legalName: 'Maya Rivera', displayName: 'Maya', adultConfirmed: true as const, metroId: null }
    await memberSignupProfileSet(ctx(A), { ...signup, zip: '95746' })
    expect(await home(A)).toEqual({ zip: '95746', home_market_key: 'sacramento', home_town: 'Granite Bay', home_town_geoid: '0630693' })

    await memberZipSet(ctx(A), { zip: '95667' }) // Placerville: mostly in no Place
    expect(await home(A)).toEqual({ zip: '95667', home_market_key: 'sacramento', home_town: 'county remainder', home_town_geoid: null })
    await memberZipSet(ctx(A), { zip: '95819' })
    expect(await home(A)).toEqual({ zip: '95819', home_market_key: 'sacramento', home_town: 'Sacramento', home_town_geoid: '0664000' })

    // A waiting market has no home town until the day it opens.
    await memberSignupProfileSet(ctx(W), { ...signup, zip: '96145' })
    expect(await home(W)).toEqual({ zip: '96145', home_market_key: 'tahoe', home_town: null, home_town_geoid: null })
    await inTx(async () => {
      await client.query(`update public.markets set is_open = true where slug = 'tahoe'`)
      await client.query(`select public.backfill_home_towns('tahoe')`)
      expect(await home(W)).toMatchObject({ home_town: 'Sunnyside-Tahoe City', home_town_geoid: '0676015' })
    })

    // Never shown to another member: not by a row, a view, a callable function, or a page.
    for (const reader of [null, B]) {
      expect(await as(reader, `select home_town, home_town_geoid, home_market_key from public.members where id = $1`, [A])).toEqual([])
    }
    expect(await as(A, `select home_town from public.members where id = $1`, [A])).toEqual([{ home_town: 'Sacramento' }])
    const views = await client.query(
      `select distinct v.relname from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class v on v.oid = r.ev_class
         join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
        where d.refobjid = 'public.members'::regclass and a.attname in ('home_town', 'home_town_geoid', 'home_market_key') and v.oid <> 'public.members'::regclass`,
    )
    expect(views.rows).toEqual([])
    const fns = await client.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc ~* 'home_town|home_market_key'
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
    )
    expect(fns.rows.map((r) => r.proname).filter((n) => n !== 'backfill_home_towns')).toEqual([]) // it returns a count
    expect(namesHomeTown(join(ROOT, 'src')).filter((p) => !['src/actions/member/signup-profile-set.ts', 'src/actions/member/zip-set.ts'].includes(p))).toEqual([])
  })
})
