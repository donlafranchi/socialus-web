import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { mapLog } from '@/actions'

// plan #258 option A (Don, 2026-11-01) — "Show on map" and Directions taps, counted per day with no member id,
// never for a member who turned logging off on You or a builder, and read back only by staff with metrics.view.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'map taps are counted per day with no member id, and read back only by staff',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `f2580000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANALYST = id(1), DANA = id(2), EVE = id(3), QUIET = id(4), BUILDER = id(5)
const MEMBERS = [ANALYST, DANA, EVE, QUIET, BUILDER]
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

// Shared database: read today's totals and compare, and delete only the keys this file's members made.
const totals = async () => {
  const rows = (await q(`select kind, taps from public.map_tap_daily where day = (now() at time zone 'America/Los_Angeles')::date`)).rows as { kind: string; taps: number }[]
  return { show_on_map: 0, directions: 0, ...Object.fromEntries(rows.map((r) => [r.kind, r.taps])) } as Record<'show_on_map' | 'directions', number>
}
let before: Record<'show_on_map' | 'directions', number>
const added = async () => {
  const now = await totals()
  return { show_on_map: now.show_on_map - before.show_on_map, directions: now.directions - before.directions }
}
const hash = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex')
async function forgetOurKeys() {
  const day = (await q(`select (now() at time zone 'America/Los_Angeles')::date::text as d`)).rows[0].d as string
  const buckets = MEMBERS.flatMap((m) => ['show_on_map', 'directions'].map((k) => hash(k, m, day)))
  await q(`delete from public.map_tap_seen where bucket = any($1) or key like 'zz258-%'`, [buckets])
}

async function cleanup() {
  await forgetOurKeys()
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
      [m, `f258-${i}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2) on conflict (id) do nothing`, [m, `f258-m${i}`])
  }
  await q(`update public.members set search_sharing = false where id = $1`, [QUIET])
  await q(`insert into public.staff_assignments (member_id, role) values ($1,'analyst')`, [ANALYST])
  await q(`insert into public.builders (member_id, persona) values ($1,'f258')`, [BUILDER])
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
  before = await totals()
})

describe.skipIf(!RUNNABLE)('plan #258 — map taps per day', () => {
  it('counts Show on map and Directions, once per member per place a day', async () => {
    await mapLog(ctx(DANA), { kind: 'show_on_map', target: '/explore' })
    await mapLog(ctx(DANA), { kind: 'show_on_map', target: '/explore' })
    await mapLog(ctx(EVE), { kind: 'show_on_map', target: '/explore' })
    await mapLog(ctx(DANA), { kind: 'directions', target: '/g/abc' })
    await mapLog(ctx(DANA), { kind: 'directions', target: '/g/def' })
    expect(await added()).toEqual({ show_on_map: 2, directions: 2 })
  })

  it('a member counts at most 12 of a kind a day, however they call it', async () => {
    for (let i = 0; i < 20; i++) await mapLog(ctx(DANA), { kind: 'directions', target: `/g/${i}` })
    expect(await added()).toEqual({ show_on_map: 0, directions: 12 })
  })

  it('stores no member id, and skips a member who turned logging off and every builder', async () => {
    expect(await mapLog(ctx(QUIET), { kind: 'directions', target: '/g/a' })).toEqual({ logged: false })
    expect(await mapLog(ctx(BUILDER), { kind: 'directions', target: '/g/a' })).toEqual({ logged: false })
    expect(await added()).toEqual({ show_on_map: 0, directions: 0 })
    const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name in ('map_tap_daily','map_tap_seen')`)).rows.map((r) => r.column_name)
    expect(cols.some((c: string) => /member/.test(c))).toBe(false)
  })

  it('deletes its dedupe keys after 8 days', async () => {
    await q(`insert into public.map_tap_seen (key, seen_on) values ('zz258-old', current_date - 9)`)
    await mapLog(ctx(EVE), { kind: 'show_on_map', target: '/explore' })
    expect((await q(`select 1 from public.map_tap_seen where key = 'zz258-old'`)).rows).toEqual([])
  })

  it('only staff with metrics.view read the counts; members and strangers read none', async () => {
    await mapLog(ctx(DANA), { kind: 'directions', target: '/g/a' })
    const staff = (await as<{ directions: number }>(ANALYST, `select directions from public.admin_map_taps(14) where day = (now() at time zone 'America/Los_Angeles')::date`)) as { directions: number }[]
    expect(staff).toEqual([{ directions: before.directions + 1 }])
    expect(await as(DANA, `select * from public.admin_map_taps(14)`)).toEqual([])
    expect(await as(DANA, `select * from public.map_tap_daily`)).toMatch(/permission/i)
    expect(await as(null, `select * from public.map_tap_seen`)).toMatch(/permission/i)
  })
})
