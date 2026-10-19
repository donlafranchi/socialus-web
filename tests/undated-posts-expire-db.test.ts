import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #314 (Don, 2026-10-02) — an undated post drops off Explore 14 days after it was posted, unless its owner
// set a "show until" date. browse_feed and announcements_withheld read one rule, post_current_until.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'an undated post leaves Explore after 14 days unless its owner set a show-until date',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000314'
const VISITOR = 'b4000000-0000-4000-8000-000000000314'
const PAGE = 'c4000000-0000-4000-8000-000000000314'
const ANCHOR = 'd4000000-0000-4000-8000-000000000314'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
const DAY = 86_400_000
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString()

let pool: Pool
let client: PoolClient
const ids: Record<string, string> = {}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'u314-owner'], [VISITOR, 'u314-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Hall','u314-hall', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','U314 Hall','u314-hall','active','listed',$2,$3)`,
    [PAGE, OWNER, ANCHOR],
  )
  const add = async (key: string, createdDaysAgo: number, showUntil: string | null) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.page_posts (group_id, body, lifecycle_state, created_at, updated_at, show_until)
       values ($1,$2,'active',$3,$3,$4) returning id`,
      [PAGE, `u314 ${key}`, ago(createdDaysAgo), showUntil],
    )
    ids[key] = rows[0]!.id
  }
  await add('fresh', 3, null)
  await add('stale', 15, null)
  await add('extended', 20, new Date(Date.now() + 5 * DAY).toISOString())
  await add('cut short', 3, ago(1))
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

const shown = (rows: { result_id: string }[]) =>
  Object.keys(ids).filter((k) => rows.some((r) => r.result_id === ids[k])).sort()

describe.skipIf(!RUNNABLE)('#314 — undated posts expire after 14 days', () => {
  it('Explore keeps an undated post for 14 days, or until the date its owner set', async () => {
    await asVisitor(async () => {
      const { rows } = await client.query<{ result_id: string }>(
        `select result_id from public.browse_feed(p_metro_id => ${METRO}, p_result_kinds => array['post'], p_limit => 500)`,
      )
      expect(shown(rows)).toEqual(['extended', 'fresh'])
    })
  })

  it('the withheld counts follow the same rule', async () => {
    await asVisitor(async () => {
      const { rows } = await client.query<{ announcement_ids: string[] }>(
        `select announcement_ids from public.announcements_withheld(p_metro_id => ${METRO}, p_limit => 500)`,
      )
      expect(shown(rows.flatMap((r) => r.announcement_ids).map((result_id) => ({ result_id })))).toEqual(['extended', 'fresh'])
    })
  })

  it('a show-until date is only for an undated post, and only after it was posted', async () => {
    for (const sql of [
      `update public.page_posts set starts_at = now() + interval '1 day' where id = '${ids.extended}'`,
      `update public.page_posts set show_until = created_at - interval '1 hour' where id = '${ids.fresh}'`,
    ]) {
      await client.query('begin')
      await expect(client.query(sql)).rejects.toThrow(/page_posts_show_until/)
      await client.query('rollback')
    }
  })

  // #913 — the Page reads the same rule, as a computed field on the row, to put an expired undated post under Earlier.
  it('the Page reads each post’s current_until from the same rule, signed in', async () => {
    await asVisitor(async () => {
      const { rows } = await client.query<{ id: string; current: boolean }>(
        `select pp.id, public.current_until(pp) >= now() as current from public.page_posts pp where pp.group_id = $1`,
        [PAGE],
      )
      const current = Object.keys(ids).filter((k) => rows.find((r) => r.id === ids[k])?.current).sort()
      expect(current).toEqual(['extended', 'fresh'])
    })
  })
})
