import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { shelfLog } from '@/actions'

// F121 — shelves are rows of data; each shelf's weekly impressions, taps and saves are counted with no member id,
// never for a member who turned logging off on You or a builder, and only staff with metrics.view read them.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'shelves are data anyone can read, counted weekly with no member id, and read back only by staff',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `f1210000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANALYST = id(1), DANA = id(2), EVE = id(3), QUIET = id(4), BUILDER = id(5)
const MEMBERS = [ANALYST, DANA, EVE, QUIET, BUILDER]
const SHELF = 'zz121-test-shelf'
const ctx = (m: string) => resolveActionContext({ actingMemberId: m })

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)

async function as<T>(sub: string | null, sql: string, params: unknown[] = []): Promise<T[] | string> {
  await q('begin')
  try {
    if (sub) await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await q(sql, params)).rows as T[]
  } catch (err) {
    return (err as Error).message
  } finally {
    await q('rollback')
  }
}

const week = async () => (await q(`select * from public.shelf_weekly where shelf_id = $1`, [SHELF])).rows[0] ?? null

async function cleanup() {
  await q(`delete from public.shelves where id like 'zz121%'`)
  await q(`delete from public.staff_assignments where member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.builders where member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.members where id = any($1)`, [MEMBERS])
  await q(`delete from auth.users where id = any($1)`, [MEMBERS])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [i, m] of MEMBERS.entries()) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [m, `f121-${i}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2) on conflict (id) do nothing`, [m, `f121-m${i}`])
  }
  await q(`update public.members set search_sharing = false where id = $1`, [QUIET])
  await q(`insert into public.staff_assignments (member_id, role) values ($1,'analyst')`, [ANALYST])
  await q(`insert into public.builders (member_id, persona) values ($1,'f121')`, [BUILDER])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await q(`delete from public.shelves where id like 'zz121%'`)
  await q(`insert into public.shelves (id, name, query, lead_days, place) values ($1, 'Test shelf', '{"tags":["gardening"]}', 14, 'rotating')`, [SHELF])
})

describe.skipIf(!RUNNABLE)('F121 — shelves as data', () => {
  // [guards F121.2]
  it('a shelf is a row: name, query, lead time, place, season and on/off; anyone reads the ones that are on, nobody writes', async () => {
    const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'shelves'`)).rows.map((r) => r.column_name)
    for (const c of ['id', 'name', 'query', 'lead_days', 'place', 'fixed_order', 'season_start', 'season_end', 'kind', 'enabled']) expect(cols).toContain(c)
    await q(`insert into public.shelves (id, name, query, place, enabled) values ('zz121-off', 'Off', '{}', 'rotating', false)`)
    const seen = (await as<{ id: string }>(null, `select id from public.shelves where id like 'zz121%' order by id`)) as { id: string }[]
    expect(seen.map((r) => r.id)).toEqual([SHELF])
    expect(await as(DANA, `insert into public.shelves (id, name, query, place) values ('zz121-mine', 'Mine', '{}', 'rotating')`)).toMatch(/permission|policy/i)
    expect(await as(DANA, `update public.shelves set name = 'x' where id = $1 returning id`, [SHELF])).toMatch(/permission/i)
  })

  // [guards F121.6]
  it('starts with the followed shelf, Next 7 days, the interest shelves and the approved rotation, Who’s proposing what? among them', async () => {
    const rows = (await q(`select id, name, place, kind from public.shelves where enabled and id not like 'zz121%'`)).rows as { id: string; name: string; place: string; kind: string }[]
    const names = rows.map((r) => r.name)
    expect(names).toContain('From who you follow')
    expect(names).toContain('Next 7 days')
    expect(names).toContain('Who’s proposing what?')
    expect(names).toContain('Getting ready for Thanksgiving')
    expect(names.join(' ')).not.toMatch(/rally/i)
    expect(rows.filter((r) => r.place === 'fixed').map((r) => r.name)).toEqual(expect.arrayContaining(['From who you follow', 'Next 7 days']))
    expect(rows.filter((r) => r.kind === 'interest')).toHaveLength(1)
    // The 15 starred shelves of the catalog (Next 7 days among them).
    expect(rows.filter((r) => r.kind === 'query')).toHaveLength(15)
  })

  it('every seeded shelf’s words parse as a search', async () => {
    const { anyWordTsQuery } = await import('@/lib/search/query')
    const rows = (await q(`select id, query from public.shelves where query ? 'anyOf'`)).rows as { id: string; query: { anyOf: string[] } }[]
    expect(rows.length).toBeGreaterThan(5)
    for (const r of rows) await q(`select to_tsquery('english', $1)`, [anyWordTsQuery(r.query.anyOf)])
  })

  // [guards F121.8]
  it('a seasonal shelf carries its dates', async () => {
    const t = (await q(`select season_start::text, season_end::text from public.shelves where name = 'Getting ready for Thanksgiving'`)).rows[0]
    expect(t).toEqual({ season_start: '2026-11-02', season_end: '2026-11-28' })
  })
})

describe.skipIf(!RUNNABLE)('F121 — counting a shelf', () => {
  // [guards F121.11]
  it('counts an impression once per member a day, members once a week, and every tap and save', async () => {
    for (const m of [DANA, DANA, EVE]) await shelfLog(ctx(m), { shelfId: SHELF, event: 'impression' })
    await shelfLog(ctx(DANA), { shelfId: SHELF, event: 'tap' })
    await shelfLog(ctx(DANA), { shelfId: SHELF, event: 'tap' })
    await shelfLog(ctx(EVE), { shelfId: SHELF, event: 'save' })
    expect(await week()).toMatchObject({ impressions: 2, members: 2, taps: 2, saves: 1 })
  })

  // [guards F121.12]
  it('stores no member id, skips a member who turned logging off and every builder, and ignores an unknown shelf', async () => {
    await shelfLog(ctx(QUIET), { shelfId: SHELF, event: 'impression' })
    await shelfLog(ctx(BUILDER), { shelfId: SHELF, event: 'tap' })
    expect(await week()).toBeNull()
    expect(await shelfLog(ctx(DANA), { shelfId: 'zz121-nope', event: 'tap' })).toEqual({ logged: false })
    const memberCols = (
      await q(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name like 'shelf%' and (column_name like '%member_id%' or data_type = 'uuid')`,
      )
    ).rows
    expect(memberCols).toEqual([])
  })

  // [guards F121.12]
  it('deletes its dedupe keys after 30 days', async () => {
    await q(`insert into public.shelf_seen (key, shelf_id, seen_on) values ('zz121-old', $1, current_date - 31)`, [SHELF])
    await shelfLog(ctx(EVE), { shelfId: SHELF, event: 'impression' })
    expect((await q(`select 1 from public.shelf_seen where key = 'zz121-old'`)).rows).toEqual([])
  })

  // [guards F121.13]
  it('only staff with metrics.view read the scoreboard; members and strangers read no counts', async () => {
    await shelfLog(ctx(DANA), { shelfId: SHELF, event: 'impression' })
    const staff = (await as<{ shelf_id: string; impressions: number }>(ANALYST, `select shelf_id, impressions from public.admin_shelf_scoreboard(4) where shelf_id = $1`, [SHELF])) as { shelf_id: string; impressions: number }[]
    expect(staff).toEqual([{ shelf_id: SHELF, impressions: 1 }])
    expect(await as(DANA, `select * from public.admin_shelf_scoreboard(4) where shelf_id = $1`, [SHELF])).toEqual([])
    expect(await as(DANA, `select * from public.shelf_weekly`)).toMatch(/permission/i)
    expect(await as(null, `select * from public.shelf_seen`)).toMatch(/permission/i)
  })
})

// [guards F121.2] [guards F121.3] — each seeded shelf's query, read the way loadShelves reads it, finds what it should.
describe.skipIf(!RUNNABLE)('F121 — a seeded shelf reads browse_feed', () => {
  const PAGE = id(20), LOC = id(30)
  const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`
  const posts: Record<string, string> = {}

  beforeAll(async () => {
    await q(`insert into public.locations (id, member_id, kind, label, slug, geography) values ($1,$2,'permanent','Barn','f121-barn', ST_GeogFromText('POINT(-121.47 38.54)'))`, [LOC, DANA])
    await q(`insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id) values ($1,'business','F121 Barn','f121-barn','active','listed',$2,$3)`, [PAGE, DANA, LOC])
    const add = async (key: string, body: string, startsInDays: number | null, kind = 'event') => {
      const starts = startsInDays === null ? null : new Date(Date.now() + startsInDays * 86_400_000).toISOString()
      posts[key] = (await q(`insert into public.page_posts (group_id, body, starts_at, kind, lifecycle_state) values ($1,$2,$3,$4,'active') returning id`, [PAGE, body, starts, starts ? kind : 'news'])).rows[0].id
    }
    await add('goats', 'Goat yoga at the barn', 2)
    await add('soon', 'Barn dance', 3)
    await add('later', 'Winter barn dance', 30)
    await add('wonder', 'Weekday dog walking?', null)
    await q(`update public.page_posts set kind = 'wonder' where id = $1`, [posts.wonder])
  })
  afterAll(async () => {
    await q(`delete from public.page_posts where group_id = $1`, [PAGE])
    await q(`delete from public.groups where id = $1`, [PAGE])
    await q(`delete from public.locations where id = $1`, [LOC])
  })

  const read = async (shelfId: string) => {
    const { feedArgs } = await import('@/lib/shelves/shelves')
    const { anyWordTsQuery } = await import('@/lib/search/query')
    const row = (await q(`select query, lead_days from public.shelves where id = $1`, [shelfId])).rows[0] as { query: Record<string, unknown>; lead_days: number | null }
    const a = feedArgs({ query: row.query, leadDays: row.lead_days }, new Date())
    const rows = (await as<{ result_id: string }>(
      EVE,
      `select result_id from public.browse_feed(p_metro_id => ${METRO}, p_result_kinds => array['post'], p_tags => $1, p_post_kinds => $2,
         p_starts_from => $3, p_starts_before => $4, p_search => $5, p_sort => $6, p_limit => 200)`,
      [a.tags ?? null, a.postKinds ?? null, a.startsFrom, a.startsBefore, a.anyOf ? anyWordTsQuery(a.anyOf) : null, a.startsFrom ? 'soonest' : 'recent'],
    )) as { result_id: string }[]
    return new Set(rows.map((r) => r.result_id))
  }

  it('Play with farm animals finds the goats by any of its words; Next 7 days holds what starts this week, not next month', async () => {
    const farm = await read('play-with-farm-animals')
    expect(farm.has(posts.goats!)).toBe(true)
    expect(farm.has(posts.soon!)).toBe(false)
    const week = await read('next-7-days')
    expect(week.has(posts.soon!)).toBe(true)
    expect(week.has(posts.later!)).toBe(false)
    expect((await read('plan-ahead-next-month')).has(posts.later!)).toBe(true)
  })

  it('Who’s proposing what? holds open Proposals only', async () => {
    const proposing = await read('whos-proposing-what')
    expect(proposing.has(posts.wonder!)).toBe(true)
    expect(proposing.has(posts.goats!)).toBe(false)
  })
})
