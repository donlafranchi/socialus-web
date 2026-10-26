import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #941 — Explore's feed read does per-row work once per Page, and builds what it only returns for the rows it
// returns. Counted, not timed: pg_stat_xact_user_functions counts this transaction's calls of each SQL
// function, so the check is the same on a laptop and in CI. Before #941, place_url_path ran for every row in
// scope (not the ≤ limit returned) and builder_visible once per Page plus once per post.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "Explore's feed read builds each row's extras for the rows it returns, and checks each Page once",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000941'
const VISITOR = 'b4000000-0000-4000-8000-000000000941'
const ANCHOR = 'd4000000-0000-4000-8000-000000000941'
const PAGES = ['c4000000-0000-4000-8000-000000009411', 'c4000000-0000-4000-8000-000000009412', 'c4000000-0000-4000-8000-000000009413']
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
const LIMIT = 2

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 's941-owner'], [VISITOR, 's941-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Yard','s941-yard', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  for (const [n, id] of PAGES.entries()) {
    await client.query(
      `insert into public.groups (id, kind, name, description, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business',$2,'A Page for the feed-speed check.',$3,'active','listed',$4,$5)`,
      [id, `S941 Page ${n}`, `s941-page-${n}`, OWNER, ANCHOR],
    )
    for (let k = 0; k < 3; k++)
      await client.query(`insert into public.page_posts (group_id, body, lifecycle_state) values ($1,$2,'active')`, [id, `S941 post ${n}.${k}`])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = any($1)`, [PAGES])
  await client.query(`delete from public.group_events where group_id = any($1)`, [PAGES])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [PAGES])
  await client.query(`delete from public.groups where id = any($1)`, [PAGES])
  await client.query(`delete from public.locations where id = $1`, [ANCHOR])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, VISITOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, VISITOR]])
  client.release()
  await pool.end()
})

async function counters(): Promise<Map<string, number>> {
  const { rows } = await client.query<{ funcname: string; calls: string }>(
    `select funcname, calls from pg_stat_xact_user_functions where schemaname = 'public' and funcname in ('place_url_path', 'builder_visible')`,
  )
  return new Map(rows.map((r) => [r.funcname, Number(r.calls)]))
}

/** One signed-in browse_feed read; how many rows it returned, and this read's calls of each counted function. */
async function countedRead(args: string) {
  await client.query('begin')
  try {
    await client.query(`set local track_functions = 'all'`)
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: VISITOR, role: 'authenticated' })])
    // Counters not yet flushed from earlier transactions in this session show here too: count the difference.
    const before = await counters()
    await client.query('set local role authenticated')
    const read = await client.query(`select count(*)::int as n from public.browse_feed(p_metro_id => ${METRO}, ${args})`)
    await client.query('reset role')
    const after = await counters()
    const live = await client.query(
      `select count(*)::int as n from public.groups where lifecycle_state = 'active' and discoverability = 'listed' and dissolved_at is null`,
    )
    const of = (f: string) => (after.get(f) ?? 0) - (before.get(f) ?? 0)
    return { rows: read.rows[0].n as number, placePath: of('place_url_path'), builderVisible: of('builder_visible'), livePages: live.rows[0].n as number }
  } finally {
    await client.query('rollback')
  }
}

describe.skipIf(!RUNNABLE)('#941 — the feed read does its per-row work for what it returns', () => {
  it('builds the place path for the rows returned only, not every row in the market', async () => {
    const r = await countedRead(`p_limit => ${LIMIT}`)
    expect(r.rows).toBe(LIMIT)
    expect(r.placePath).toBeLessThanOrEqual(LIMIT)
  })

  it('checks each Page once, not once per Page and again per post', async () => {
    const r = await countedRead(`p_limit => 100`)
    expect(r.builderVisible).toBeLessThanOrEqual(r.livePages)
  })

  it('a search does the same', async () => {
    const r = await countedRead(`p_search => 's941', p_search_raw => 's941', p_limit => ${LIMIT}`)
    expect(r.rows).toBe(LIMIT)
    expect(r.placePath).toBeLessThanOrEqual(LIMIT)
  })
})
