import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #262 (F072 criterion 3, Don 2026-09-30): an announcement may carry an end
// time, only beside a start and after it, and Explore returns it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'an announcement can end, only after it starts, and Explore says when',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000262'
const VISITOR = 'b4000000-0000-4000-8000-000000000262'
const PAGE = 'c4000000-0000-4000-8000-000000000262'
const ANCHOR = 'd4000000-0000-4000-8000-000000000262'
const POST = 'e4000000-0000-4000-8000-000000000262'
const START = '2026-12-11T02:00:00.000Z'
const END = '2026-12-11T04:00:00.000Z'

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b262-owner'], [VISITOR, 'b262-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','The Bakery','b262-bakery', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','B262 Bakery','b262-bakery','active','listed',$2,$3)`,
    [PAGE, OWNER, ANCHOR],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.locations where id = $1`, [ANCHOR])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, VISITOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, VISITOR]])
  client.release()
  await pool.end()
})

const insert = (starts: string | null, ends: string | null) =>
  client.query(
    `insert into public.page_posts (group_id, body, starts_at, ends_at, lifecycle_state) values ($1,'x',$2,$3,'active')`,
    [PAGE, starts, ends],
  )

describe.skipIf(!RUNNABLE)('an announcement’s end time', () => {
  it('is refused without a start', async () => {
    await expect(insert(null, END)).rejects.toThrow(/check constraint/)
  })

  it('is refused at or before the start', async () => {
    await expect(insert(END, START)).rejects.toThrow(/check constraint/)
    await expect(insert(START, START)).rejects.toThrow(/check constraint/)
  })

  it('reaches a signed-in reader through Explore', async () => {
    await client.query(
      `insert into public.page_posts (id, group_id, body, starts_at, ends_at, lifecycle_state) values ($1,$2,'Bread class',$3,$4,'active')`,
      [POST, PAGE, START, END],
    )
    await client.query('begin')
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: VISITOR, role: 'authenticated' }),
      ])
      await client.query('set local role authenticated')
      const { rows } = await client.query<{ ends_at: Date | null }>(
        `select ends_at from public.browse_feed(
           p_metro_id => (select id from public.metro_polygons where slug = 'sacramento-roseville-ca'),
           p_result_kinds => array['post']) where result_id = $1`,
        [POST],
      )
      expect(rows.map((r) => r.ends_at?.toISOString())).toEqual([END])
    } finally {
      await client.query('rollback')
    }
  })
})
