import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// bug #918 — backfill_home_towns is SECURITY DEFINER and writes members; Supabase's default privileges leave it
// executable by anon and authenticated. Only service_role or a direct postgres connection may run it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a signed-out or signed-in caller cannot run the home-town backfill; service_role can',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const A = 'a7000000-0000-4000-8000-000000000918'
let pool: Pool
let client: PoolClient
const homeTown = async () =>
  (await client.query(`select home_market_key, home_town from public.members where id = $1`, [A])).rows[0]
const stale = () =>
  client.query(`update public.members set zip = '95746', home_market_key = null, home_town = null where id = $1`, [A])

const callAs = async (role: 'anon' | 'authenticated' | 'service_role') => {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(role === 'anon' ? { role } : { sub: A, role }),
    ])
    await client.query(`set local role ${role}`)
    const n = (await client.query(`select public.backfill_home_towns('sacramento') as n`)).rows[0].n
    await client.query('commit')
    return n
  } catch (e) {
    await client.query('rollback')
    throw e
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b918@test.invalid','x',now(),now(),now())`,
    [A],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b918','b918')`, [A])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.members where id = $1`, [A])
  await client.query(`delete from auth.users where id = $1`, [A])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('bug #918 — home-town backfill is service-only', () => {
  it.each(['anon', 'authenticated'] as const)('%s is refused and no member changes', async (role) => {
    await stale()
    expect(await callAs(role)).toBe(0)
    expect(await homeTown()).toEqual({ home_market_key: null, home_town: null })
  })

  it('service_role still runs it', async () => {
    await stale()
    expect(await callAs('service_role')).toBeGreaterThanOrEqual(1)
    expect(await homeTown()).toEqual({ home_market_key: 'sacramento', home_town: 'Granite Bay' })
  })
})
