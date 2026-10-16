import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #796 — browse_feed marks a seeder sample (sample_kind) and filters posts by kind (p_post_kinds).
// Built on #791's fixture. browse_happening must return
// exactly what browse_feed returns for this week and for this weekend: same
// rows, same visibility, per-bucket limit — more than the limit of posts land
// before the weekend, which a single capped read would have cut.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'browse_feed marks samples and filters posts by kind',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000876'
const VISITOR = 'b4000000-0000-4000-8000-000000000876'
const PAGE = 'c4000000-0000-4000-8000-000000000876'
const ANCHOR = 'd4000000-0000-4000-8000-000000000876'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
const HOUR = 3_600_000
const NOW = Date.now()
const at = (h: number) => new Date(NOW + h * HOUR).toISOString()

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b876-owner'], [VISITOR, 'b876-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Hall','b876-hall', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','B876 Hall','b876-hall','active','listed',$2,$3)`,
    [PAGE, OWNER, ANCHOR],
  )
  // Twelve posts before the weekend (more than the limit) and four in it, plus one after.
  const hours = [1, 3, 5, 8, 12, 16, 20, 24, 28, 32, 40, 46, 50, 60, 70, 90, 120]
  for (const h of hours) {
    await client.query(`insert into public.page_posts (group_id, body, starts_at, lifecycle_state) values ($1,$2,$3,'active')`, [PAGE, `b876 ${h}h`, at(h)])
  }
  await client.query(`insert into public.page_posts (group_id, body, starts_at, ends_at, lifecycle_state, sample_kind) values ($1,'Sample · deal',$2,$3,'active','deal')`, [PAGE, at(2), at(30)])
  await client.query(`insert into public.page_posts (group_id, body, lifecycle_state) values ($1,'b876 undated','active')`, [PAGE])
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

const kinds = (k: string[] | null) =>
  client.query<{ body: string; sample_kind: string | null }>(
    `select body, sample_kind from public.browse_feed(p_metro_id => ${METRO}, p_result_kinds => array['post'], p_post_kinds => $1, p_limit => 100)
      where group_id = $2`,
    [k, PAGE],
  )

describe.skipIf(!RUNNABLE)('browse_feed kinds and samples', () => {
  it('returns sample_kind on a sample and null on a real post', async () => {
    await asVisitor(async () => {
      const { rows } = await kinds(null)
      expect(rows.find((r) => r.body === 'Sample · deal')?.sample_kind).toBe('deal')
      expect(rows.find((r) => r.body === 'b876 1h')?.sample_kind).toBeNull()
    })
  })
  it('deal matches the sample deal only; event matches dated real posts; undated posts match no kind', async () => {
    await asVisitor(async () => {
      expect((await kinds(['deal'])).rows.map((r) => r.body)).toEqual(['Sample · deal'])
      const events = (await kinds(['event'])).rows.map((r) => r.body)
      expect(events).toContain('b876 1h')
      expect(events).not.toContain('Sample · deal')
      expect(events).not.toContain('b876 undated')
    })
  })
})
