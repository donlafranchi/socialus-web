import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #896 — a Page's locations and where-and-when list: signed in only, written
// only through the action layer, and the new where answers are accepted.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a Page's stops answer signed-in visitors only, refuse member writes, and the six where answers are the only ones",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a5000000-0000-4000-8000-000000000896'
const PAGE = 'c5000000-0000-4000-8000-000000000896'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
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
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b896-owner@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b896-owner','b896-owner')`, [OWNER])
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, where_mode)
     values ($1,'business','B896 Tacos','b896-tacos','Tacos.','active','listed',$2,'roaming')`,
    [PAGE, OWNER],
  )
  await client.query(
    `insert into public.page_stops (group_id, position, label, when_text) values ($1, 0, 'Midtown Farmers Market', 'Saturdays, 8am–1pm')`,
    [PAGE],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("#896 — a Page's stops", () => {
  it('answer a signed-in visitor', async () => {
    const rows = await as<{ label: string; when_text: string }>(OWNER, `select label, when_text from public.page_stops where group_id = $1`, [PAGE])
    expect(rows).toEqual([{ label: 'Midtown Farmers Market', when_text: 'Saturdays, 8am–1pm' }])
  })

  it('never answer a signed-out caller', async () => {
    await expect(as(null, `select label from public.page_stops where group_id = '${PAGE}'`)).rejects.toThrow(/permission denied/)
  })

  it('refuse a write from a member, even the owner', async () => {
    await expect(as(OWNER, `insert into public.page_stops (group_id, position, label) values ('${PAGE}', 1, 'x')`)).rejects.toThrow(/permission denied/)
  })

  it('accept the new answers and nothing else', async () => {
    for (const mode of ['visit', 'landmark', 'multi', 'roaming', 'travel', 'online']) {
      await client.query(`update public.groups set where_mode = $2 where id = $1`, [PAGE, mode])
    }
    await expect(client.query(`update public.groups set where_mode = 'anywhere' where id = $1`, [PAGE])).rejects.toThrow(/check/)
  })

  it('refuse a blank stop', async () => {
    await expect(client.query(`insert into public.page_stops (group_id, position, label) values ($1, 2, '  ')`, [PAGE])).rejects.toThrow(/check/)
  })
})
