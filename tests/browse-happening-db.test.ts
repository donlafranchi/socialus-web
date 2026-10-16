import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #791 — Explore's "happening" rows in one call. browse_happening must return
// exactly what browse_feed returns for this week and for this weekend: same
// rows, same visibility, per-bucket limit — more than the limit of posts land
// before the weekend, which a single capped read would have cut.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "Explore's happening rows come back in one call, the same as three",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000791'
const VISITOR = 'b4000000-0000-4000-8000-000000000791'
const PAGE = 'c4000000-0000-4000-8000-000000000791'
const ANCHOR = 'd4000000-0000-4000-8000-000000000791'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
const HOUR = 3_600_000
const NOW = Date.now()
const at = (h: number) => new Date(NOW + h * HOUR).toISOString()
const WEEK_FROM = at(0)
const WEEKEND_FROM = at(48)
const BEFORE = at(96)
const LIMIT = 5

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b791-owner'], [VISITOR, 'b791-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Hall','b791-hall', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','B791 Hall','b791-hall','active','listed',$2,$3)`,
    [PAGE, OWNER, ANCHOR],
  )
  // Twelve posts before the weekend (more than the limit) and four in it, plus one after.
  const hours = [1, 3, 5, 8, 12, 16, 20, 24, 28, 32, 40, 46, 50, 60, 70, 90, 120]
  for (const h of hours) {
    await client.query(`insert into public.page_posts (group_id, body, starts_at, lifecycle_state) values ($1,$2,$3,'active')`, [PAGE, `b791 ${h}h`, at(h)])
  }
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

async function asVisitor<T>(fn: () => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: VISITOR, role: 'authenticated' })])
    await client.query('set local role authenticated')
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

const feed = (from: string) =>
  client.query<{ result_id: string }>(
    `select result_id from public.browse_feed(p_metro_id => ${METRO}, p_result_kinds => array['post'],
       p_starts_from => $1, p_starts_before => $2, p_sort => 'soonest', p_limit => $3)`,
    [from, BEFORE, LIMIT],
  )

describe.skipIf(!RUNNABLE)('browse_happening', () => {
  it('returns this week and this weekend exactly as browse_feed does, in one call', async () => {
    await asVisitor(async () => {
      const week = (await feed(WEEK_FROM)).rows.map((r) => r.result_id)
      const weekend = (await feed(WEEKEND_FROM)).rows.map((r) => r.result_id)
      const { rows } = await client.query<{ bucket: string; result_id: string; sort_at: Date; updated_at: Date }>(
        `select bucket, result_id, sort_at, updated_at from public.browse_happening(
           p_metro_id => ${METRO}, p_place_id => null, p_from => $1, p_weekend_from => $2, p_before => $3, p_limit => $4)`,
        [WEEK_FROM, WEEKEND_FROM, BEFORE, LIMIT],
      )
      const order = (b: string) => rows.filter((r) => r.bucket === b).sort((x, y) => +x.sort_at - +y.sort_at || +y.updated_at - +x.updated_at || (x.result_id < y.result_id ? -1 : 1)).map((r) => r.result_id)
      expect(week).toHaveLength(LIMIT)
      expect(weekend.length).toBeGreaterThan(0)
      expect(order('week')).toEqual(week)
      expect(order('weekend')).toEqual(weekend)
    })
  })

  it('a signed-out caller gets no posts', async () => {
    await client.query('begin')
    try {
      await client.query('set local role anon')
      const { rows } = await client.query(
        `select 1 from public.browse_happening(p_metro_id => ${METRO}, p_place_id => null, p_from => $1, p_weekend_from => $2, p_before => $3, p_limit => $4)`,
        [WEEK_FROM, WEEKEND_FROM, BEFORE, LIMIT],
      )
      expect(rows).toHaveLength(0)
    } finally {
      await client.query('rollback')
    }
  })
})
