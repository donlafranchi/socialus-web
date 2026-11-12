import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { usageLog } from '@/actions'

// F133 (the PM, 2026-11-12) — usage counts in our own database: who comes back, what they use, where they drop off.
// Counts only, no member id beside them, never a member who turned sharing off or a builder, read only by staff.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'usage is counted with no member id, never for a member with sharing off or a builder, and read only by staff',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `f1330000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANALYST = id(1), DANA = id(2), EVE = id(3), QUIET = id(4), BUILDER = id(5), OLD = id(6)
const MEMBERS = [ANALYST, DANA, EVE, QUIET, BUILDER, OLD]
const HOOD = id(90)
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

// Shared database: compare today's and this week's totals before and after, and delete only this file's keys.
type Snapshot = { daily: Record<string, number>; funnel: Record<string, number>; weekly: Record<string, number> }
async function snapshot(): Promise<Snapshot> {
  const today = `(now() at time zone 'America/Los_Angeles')::date`
  const daily = (await q(`select part as k, members as n from public.usage_daily where day = ${today}`)).rows
  const funnel = (await q(`select step as k, reached as n from public.funnel_weekly where week = date_trunc('week', ${today})::date`)).rows
  const weekly = (await q(`select join_week::text as k, active as n from public.usage_weekly where week = date_trunc('week', ${today})::date`)).rows
  const map = (rows: { k: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.k, r.n]))
  return { daily: map(daily), funnel: map(funnel), weekly: map(weekly) }
}
let before: Snapshot
async function added(): Promise<Snapshot> {
  const now = await snapshot()
  const diff = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(Object.keys(a).map((k) => [k, a[k]! - (b[k] ?? 0)]).filter(([, n]) => n !== 0))
  return { daily: diff(now.daily, before.daily), funnel: diff(now.funnel, before.funnel), weekly: diff(now.weekly, before.weekly) }
}

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
async function forgetOurKeys() {
  const { day, week } = (
    await q(`select (now() at time zone 'America/Los_Angeles')::date::text as day,
                    date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date::text as week`)
  ).rows[0] as { day: string; week: string }
  const parts = ['posts', 'explore', 'pages', 'groups', 'map', 'search', 'ask']
  const steps = ['signed_in', 'profile', 'welcomed', 'first_follow', 'first_post']
  const keys = MEMBERS.flatMap((m) => [
    hash(`usage-week|${m}|${week}`),
    ...parts.map((p) => hash(`usage-part|${m}|${p}|${day}`)),
    ...steps.map((s) => hash(`usage-step|${m}|${s}`)),
  ])
  await q(`delete from public.usage_seen where key = any($1) or key like 'zz133-%'`, [keys])
}

async function cleanup() {
  await forgetOurKeys()
  await q(`delete from public.member_posts where member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.member_follows where follower_member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.staff_assignments where member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.builders where member_id = any($1)`, [MEMBERS]).catch(() => undefined)
  await q(`delete from public.members where id = any($1)`, [MEMBERS])
  await q(`delete from auth.users where id = any($1)`, [MEMBERS])
  await q(`delete from public.places where id = $1`, [HOOD]).catch(() => undefined)
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
      [m, `f133-${i}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2) on conflict (id) do nothing`, [m, `f133-m${i}`])
  }
  // OLD joined three weeks ago, so active members split by join week.
  await q(`update public.members set created_at = now() - interval '21 days' where id = $1`, [OLD])
  await q(`update public.members set search_sharing = false where id = $1`, [QUIET])
  await q(`insert into public.staff_assignments (member_id, role) values ($1,'analyst')`, [ANALYST])
  await q(`insert into public.builders (member_id, persona) values ($1,'f133')`, [BUILDER])
  await q(
    `insert into public.places (id, slug, display_name, kind, geography, centroid) values
       ($1, 'f133-hood', 'Curtis Park', 'neighborhood',
        ST_GeogFromText('MULTIPOLYGON(((-121.50 38.55, -121.48 38.55, -121.48 38.56, -121.50 38.56, -121.50 38.55)))'),
        ST_GeogFromText('POINT(-121.49 38.555)'))`,
    [HOOD],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await forgetOurKeys()
  before = await snapshot()
})

describe.skipIf(!RUNNABLE)('F133 — usage counts', () => {
  // [guards F133.2]
  it('counts members per part per day, once per member per part per day', async () => {
    await usageLog(ctx(DANA), { part: 'explore' })
    await usageLog(ctx(DANA), { part: 'explore' })
    await usageLog(ctx(EVE), { part: 'explore' })
    await usageLog(ctx(DANA), { part: 'map' })
    expect((await added()).daily).toEqual({ explore: 2, map: 1 })
  })

  // [guards F133.1]
  it('counts members active this week by the week they joined, once a week', async () => {
    await usageLog(ctx(DANA), { part: 'explore' })
    await usageLog(ctx(DANA), { part: 'posts' })
    await usageLog(ctx(OLD), { part: 'pages' })
    const weeks = (await q(`select date_trunc('week', created_at at time zone 'America/Los_Angeles')::date::text as w from public.members where id = any($1) order by created_at`, [[OLD, DANA]])).rows.map((r) => r.w as string)
    expect((await added()).weekly).toEqual({ [weeks[0]!]: 1, [weeks[1]!]: 1 })
  })

  // [guards F133.3]
  it('counts each sign-up step, a first follow and a first post once per member a week', async () => {
    await usageLog(ctx(EVE), { step: 'signed_in' })
    await usageLog(ctx(EVE), { step: 'signed_in' })
    await usageLog(ctx(EVE), { step: 'profile' })
    await usageLog(ctx(EVE), { step: 'welcomed' })
    await q(`insert into public.member_follows (follower_member_id, followed_member_id) values ($1,$2)`, [EVE, DANA])
    await usageLog(ctx(EVE), { step: 'first_follow' })
    await q(`insert into public.member_posts (member_id, kind, body, place_id, expires_at) values ($1,'ask','f133',$2, now() + interval '7 days')`, [EVE, HOOD])
    await usageLog(ctx(EVE), { step: 'first_post' })
    // A second follow or post is not a first, even once the keys are gone.
    await forgetOurKeys()
    await q(`insert into public.member_follows (follower_member_id, followed_member_id) values ($1,$2)`, [EVE, OLD])
    await usageLog(ctx(EVE), { step: 'first_follow' })
    await q(`insert into public.member_posts (member_id, kind, body, place_id, expires_at) values ($1,'ask','f133 again',$2, now() + interval '7 days')`, [EVE, HOOD])
    await usageLog(ctx(EVE), { step: 'first_post' })
    // A sign-up step reached again after the member's first week, when its key is gone, is not counted again.
    await usageLog(ctx(OLD), { step: 'signed_in' })
    await usageLog(ctx(OLD), { step: 'welcomed' })
    expect((await added()).funnel).toEqual({ signed_in: 1, profile: 1, welcomed: 1, first_follow: 1, first_post: 1 })
  })

  // [guards F133.6]
  it('never counts a member who turned sharing off, or a builder', async () => {
    for (const m of [QUIET, BUILDER]) {
      expect(await usageLog(ctx(m), { part: 'explore' })).toEqual({ counted: false })
      expect(await usageLog(ctx(m), { step: 'signed_in' })).toEqual({ counted: false })
    }
    expect(await added()).toEqual({ daily: {}, funnel: {}, weekly: {} })
  })

  // [guards F133.4]
  it('stores no member id beside a count, keeps only hashes, and deletes them after 8 days', async () => {
    await q(`insert into public.usage_seen (key, seen_on) values ('zz133-old', current_date - 9)`)
    await usageLog(ctx(DANA), { part: 'search' })
    expect((await q(`select 1 from public.usage_seen where key = 'zz133-old'`)).rows).toEqual([])
    const cols = (
      await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name in ('usage_daily','usage_weekly','funnel_weekly','usage_seen')`)
    ).rows.map((r) => r.column_name as string)
    expect(cols.sort()).toEqual(['active', 'day', 'join_week', 'key', 'members', 'part', 'reached', 'seen_on', 'step', 'week', 'week'])
    const keys = (await q(`select key from public.usage_seen where seen_on = current_date`)).rows.map((r) => r.key as string)
    expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true)
  })

  // [guards F133.7]
  it('only staff with metrics.view read the counts; members and strangers read none', async () => {
    await usageLog(ctx(DANA), { part: 'groups' })
    await usageLog(ctx(DANA), { step: 'welcomed' })
    for (const fn of ['admin_usage_daily(14)', 'admin_usage_weekly(12)', 'admin_funnel_weekly(12)']) {
      expect(((await as(ANALYST, `select * from public.${fn}`)) as unknown[]).length).toBeGreaterThan(0)
      expect(await as(DANA, `select * from public.${fn}`)).toEqual([])
      expect(await as(null, `select * from public.${fn}`)).toMatch(/permission/i)
    }
    for (const t of ['usage_daily', 'usage_weekly', 'funnel_weekly', 'usage_seen']) {
      expect(await as(DANA, `select * from public.${t}`)).toMatch(/permission/i)
      expect(await as(null, `select * from public.${t}`)).toMatch(/permission/i)
    }
  })
})
