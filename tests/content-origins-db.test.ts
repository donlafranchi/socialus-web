import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// F102 criterion 13 — the address a post came from is operator-only and gone
// after a year.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no browser client reads where a post came from, and rows older than a year are purged',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a8000000-0000-4000-8000-000000000488'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql)).rows as T[]
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
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b488@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b488o','b488o')`, [MEMBER])
  await client.query(
    `insert into public.content_origins (member_id, kind, ref, ip, created_at) values
       ($1,'post','recent','203.0.113.7', now() - interval '11 months'),
       ($1,'upload','old','203.0.113.7', now() - interval '13 months')`,
    [MEMBER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.content_origins where member_id = $1`, [MEMBER])
  await client.query(`delete from public.members where id = $1`, [MEMBER])
  await client.query(`delete from auth.users where id = $1`, [MEMBER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('F102 — content origins', () => {
  it('a member, even the one it is about, reads none of it', async () => {
    expect(await as(MEMBER, `select * from public.content_origins`)).toHaveLength(0)
  })

  it('signed out reads none of it', async () => {
    expect(await as(null, `select * from public.content_origins`)).toHaveLength(0)
  })

  it('no browser client can run the purge', async () => {
    const r = await client.query(
      `select has_function_privilege('authenticated', 'public.purge_content_origins(timestamptz)', 'execute') as a,
              has_function_privilege('anon', 'public.purge_content_origins(timestamptz)', 'execute') as b`,
    )
    expect(r.rows[0]).toEqual({ a: false, b: false })
  })

  // [guards F102.13 partial: the one-year deletion]
  it('the purge removes what is older than a year and keeps the rest', async () => {
    const n = (await client.query(`select public.purge_content_origins() as n`)).rows[0].n
    expect(n).toBeGreaterThanOrEqual(1)
    const left = await client.query(`select ref from public.content_origins where member_id = $1`, [MEMBER])
    expect(left.rows.map((r) => r.ref)).toEqual(['recent'])
  })
})
