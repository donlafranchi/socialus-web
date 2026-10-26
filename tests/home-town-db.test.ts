import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #695 — F103.5: a member in an open market has a home town (the Census Place their zip mostly lies in, else the
// county remainder), a member in a waiting market gets one the day it opens, and no other member can read it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a zip in the open market resolves to a home town, a waiting market to none until it opens, and no other member reads it',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const A = 'a7000000-0000-4000-8000-000000000695'
const B = 'b7000000-0000-4000-8000-000000000695'
let pool: Pool
let client: PoolClient
const home = async (zip: string) => (await client.query(`select * from public.zip_home($1)`, [zip])).rows[0]

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[A, 'b695a'], [B, 'b695b']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`update public.markets set is_open = false where slug = 'tahoe'`)
  await client.query(`delete from public.members where id = any($1)`, [[A, B]])
  await client.query(`delete from auth.users where id = any($1)`, [[A, B]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#695 — home town', () => {
  // [guards F103.5 partial: the home town is the Census Place the zip mostly lies in (95746 → Granite Bay)]
  it('an open-market zip gets the Place it mostly lies in', async () => {
    expect(await home('95746')).toEqual({ market_key: 'sacramento', town_geoid: '0630693', town_name: 'Granite Bay' })
    expect((await home('95819')).town_name).toBe('Sacramento')
    expect((await home('95616')).town_name).toBe('Davis')
  })

  // [guards F103.5 partial: a zip in no Place gives the county remainder]
  it('a zip with no Place gives the county remainder', async () => {
    const r = await home('95667') // Placerville: mostly outside any place
    expect(r.market_key).toBe('sacramento')
    expect(r.town_geoid).toBeNull()
    expect(r.town_name).toBe('county remainder')
  })

  it('a waiting market has no home town yet, only its market', async () => {
    expect(await home('96150')).toEqual({ market_key: 'tahoe', town_geoid: null, town_name: null })
    expect(await home('95901')).toEqual({ market_key: 'county-06115', town_geoid: null, town_name: null })
  })

  it('an unknown zip resolves to nothing', async () => {
    expect(await home('00000')).toBeUndefined()
  })

  // [guards F103.5 partial: a waiting member gets one the day the market opens]
  it('backfills the waiting members of a market the day it opens, and is idempotent', async () => {
    await client.query(`update public.members set zip = '96150', home_market_key = 'tahoe' where id = $1`, [A])
    await client.query(`update public.markets set is_open = true where slug = 'tahoe'`)
    const first = (await client.query(`select public.backfill_home_towns('tahoe') as n`)).rows[0].n
    expect(first).toBeGreaterThanOrEqual(1)
    expect((await client.query(`select home_town from public.members where id = $1`, [A])).rows[0].home_town).toBe('county remainder')
    expect((await client.query(`select public.backfill_home_towns('tahoe') as n`)).rows[0].n).toBe(0)
  })

  // [guards F103.5 partial: the home town never appears to another member]
  it('only the member reads their own home town', async () => {
    await client.query(`update public.members set home_market_key = 'sacramento', home_town = 'Granite Bay' where id = $1`, [A])
    const as = async (sub: string) => {
      await client.query('begin')
      try {
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
        await client.query(`set local role authenticated`)
        return (await client.query(`select home_town from public.members where id = $1`, [A])).rows
      } finally {
        await client.query('rollback')
      }
    }
    expect(await as(A)).toEqual([{ home_town: 'Granite Bay' }])
    expect(await as(B)).toEqual([])
  })
})
