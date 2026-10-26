import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #592 — F074.1: a series is weekly on chosen weekdays with an optional start and end; the table is the
// handler's alone (RLS on, no policy), and a post can point at its series.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a weekly series stores only ISO weekdays and a sane start and end, and no client can read or write it',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a6000000-0000-4000-8000-000000000592'
const GROUP = 'd6000000-0000-4000-8000-000000000592'
let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b592@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b592','b592')`, [MEMBER])
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B592 Run Club','b592-run','Runs.','active','listed',$2)`,
    [GROUP, MEMBER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = $1`, [GROUP])
  await client.query(`delete from public.post_series where group_id = $1`, [GROUP])
  await client.query(`delete from public.group_events where group_id = $1`, [GROUP])
  await client.query(`delete from public.groups where id = $1`, [GROUP])
  await client.query(`delete from public.members where id = $1`, [MEMBER])
  await client.query(`delete from auth.users where id = $1`, [MEMBER])
  client.release()
  await pool.end()
})

const insert = (weekdays: number[], startsOn: string | null = null, endsOn: string | null = null) =>
  client.query(
    `insert into public.post_series (group_id, created_by, weekdays, starts_on, ends_on) values ($1,$2,$3,$4,$5) returning id`,
    [GROUP, MEMBER, weekdays, startsOn, endsOn],
  )

describe.skipIf(!RUNNABLE)('#592 — post_series', () => {
  // [guards F074.1 partial: weekly on one or more weekdays, both bounds optional, nothing else storable]
  it('takes one to seven ISO weekdays, with the start and end optional', async () => {
    expect((await insert([4])).rowCount).toBe(1)
    expect((await insert([1, 2, 3, 4, 5, 6, 7], '2026-06-01', '2026-09-30')).rowCount).toBe(1)
    await expect(insert([])).rejects.toThrow(/weekdays_valid/)
    await expect(insert([0])).rejects.toThrow(/weekdays_valid/)
    await expect(insert([8])).rejects.toThrow(/weekdays_valid/)
    await expect(insert([1, 2, 3, 4, 5, 6, 7, 1])).rejects.toThrow(/weekdays_valid/)
  })

  it('refuses an end before the start', async () => {
    await expect(insert([4], '2026-06-02', '2026-06-01')).rejects.toThrow(/end_not_before_start/)
  })

  it('a post points at its series, and losing the series leaves the post', async () => {
    const id = (await insert([4])).rows[0].id
    const post = await client.query(
      `insert into public.page_posts (group_id, body, lifecycle_state, discoverability, series_id) values ($1,'Run','active','listed',$2) returning id`,
      [GROUP, id],
    )
    await client.query(`delete from public.post_series where id = $1`, [id])
    const left = await client.query(`select series_id from public.page_posts where id = $1`, [post.rows[0].id])
    expect(left.rows[0].series_id).toBeNull()
  })

  it('no client reads or writes it: RLS on, no policy', async () => {
    await insert([4])
    await client.query('begin')
    try {
      await client.query(`set local role authenticated`)
      expect((await client.query(`select id from public.post_series`)).rows).toHaveLength(0)
      await expect(client.query(`insert into public.post_series (group_id, created_by, weekdays) values ($1,$2,'{4}')`, [GROUP, MEMBER])).rejects.toThrow(/row-level|permission/i)
    } finally {
      await client.query('rollback')
    }
  })
})
