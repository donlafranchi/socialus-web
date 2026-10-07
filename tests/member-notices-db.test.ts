import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #220 — F078 criteria 3 and 7: a poster reads their own notices and nobody
// else's, nobody signed out reads any, and the metro's hide bar starts at 0.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a poster reads only their own notices, nobody signed out reads any, and the metro hide bar starts at zero',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const POSTER = 'a5000000-0000-4000-8000-000000000220'
const OTHER = 'b5000000-0000-4000-8000-000000000220'
const NOTICE = 'c5000000-0000-4000-8000-000000000220'
const PAGE = 'd5000000-0000-4000-8000-000000000220'

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
  for (const [id, h] of [[POSTER, 'b220-poster'], [OTHER, 'b220-other']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.member_notices (id, member_id, kind, subject_kind, subject_id, category, message)
     values ($1,$2,'content_hidden','group',$3,'spam','We hid it.')`,
    [NOTICE, POSTER, PAGE],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.member_notices where id = $1`, [NOTICE])
  await client.query(`delete from public.members where id = any($1)`, [[POSTER, OTHER]])
  await client.query(`delete from auth.users where id = any($1)`, [[POSTER, OTHER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#220 — notices and the hide bar', () => {
  // [guards F078.3 partial: who may read the notice]
  it('a poster reads their own notice', async () => {
    expect(await as(POSTER, `select id from public.member_notices`)).toHaveLength(1)
  })

  it('another member reads nothing', async () => {
    expect(await as(OTHER, `select id from public.member_notices`)).toHaveLength(0)
  })

  it('signed out, the table cannot be read at all', async () => {
    await expect(as(null, `select id from public.member_notices`)).rejects.toThrow(/permission denied/)
  })

  it('no member can write a notice through the browser client', async () => {
    await expect(
      as(POSTER, `insert into public.member_notices (member_id, kind, subject_kind, subject_id, category, message) values ($1,'content_hidden','group',$2,'spam','x')`, [POSTER, PAGE]),
    ).rejects.toThrow(/permission denied|row-level security/)
  })

  // [guards F078.7 partial: the starting value; changing it is an update, not a deploy]
  it('every metro starts with a hide bar of zero, so every report hides', async () => {
    const rows = await client.query(`select distinct hide_bar from public.metro_polygons`)
    expect(rows.rows.map((r) => Number(r.hide_bar))).toEqual([0])
  })
})
