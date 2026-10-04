import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #293 — a Page's business phone and opening hours (Don, 2026-10-01): shown
// to signed-in visitors only, never through the front door (F093 criterion 8).

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a Page's phone and hours answer signed-in visitors only, and only in a valid shape",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a5000000-0000-4000-8000-000000000293'
const READER = 'b5000000-0000-4000-8000-000000000293'
const PAGE = 'c5000000-0000-4000-8000-000000000293'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b293-owner'], [READER, 'b293-reader']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id,
                                contact_phone, opening_hours)
     values ($1,'business','B293 Bakery','b293-bakery','Bread.','active','listed',$2,'+19165550142',
             '{"mon":[{"open":"07:00","close":"15:00"}]}')`,
    [PAGE, OWNER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, READER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, READER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("#293 — a Page's phone and hours", () => {
  it('answer a signed-in visitor', async () => {
    const [row] = await as<{ contact_phone: string; opening_hours: unknown }>(
      READER,
      `select contact_phone, opening_hours from public.groups where id = $1`,
      [PAGE],
    )
    expect(row).toEqual({ contact_phone: '+19165550142', opening_hours: { mon: [{ open: '07:00', close: '15:00' }] } })
  })

  it('never answer a signed-out caller', async () => {
    for (const col of ['contact_phone', 'opening_hours']) {
      await expect(as(null, `select ${col} from public.groups where id = '${PAGE}'`)).rejects.toThrow(/permission denied/)
    }
  })

  it('a signed-out caller still reads the front door', async () => {
    expect(await as(null, `select name from public.groups where id = $1`, [PAGE])).toHaveLength(1)
  })

  it('refuse a phone that is not E.164', async () => {
    await expect(client.query(`update public.groups set contact_phone = '916-555-0142' where id = $1`, [PAGE])).rejects.toThrow(/check/)
  })

  it('refuse hours that are not an object of days', async () => {
    await expect(client.query(`update public.groups set opening_hours = '[1,2]' where id = $1`, [PAGE])).rejects.toThrow(/check/)
  })
})
