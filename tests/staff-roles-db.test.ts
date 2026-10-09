import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #544 — staff roles map to permissions in the database, the metrics function
// answers only a member whose role holds metrics.view, and its numbers match
// what the rows say. Run as real roles (anon / authenticated), not as postgres.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'staff permissions gate the metrics function and the numbers are right',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `e544${String(n).padStart(4, '0')}-0000-4000-8000-000000000544`
const OWNER = id(1), ANALYST = id(2), MODERATOR = id(3), NOBODY = id(4), REVOKED = id(5)
const NEW1 = id(10), NEW2 = id(11), NEW3 = id(12), OLD1 = id(13), OLD2 = id(14), HOST = id(15)
const MEMBERS = [OWNER, ANALYST, MODERATOR, NOBODY, REVOKED, NEW1, NEW2, NEW3, OLD1, OLD2, HOST]
const GROUP = id(20), GROUP_B = id(21), LOC_A = id(30), LOC_B = id(31), LOC_FAR = id(32)

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}
const can = async (sub: string | null, perm: string) => (await as<{ ok: boolean }>(sub, `select public.staff_can($1) as ok`, [perm]))[0]!.ok
const weeks = (sub: string) => as<Record<string, number | string>>(sub, `select * from public.admin_metrics_weekly(2) order by week_start desc`)

async function cleanup() {
  await client.query(`delete from public.page_posts where group_id = any($1)`, [[GROUP, GROUP_B]])
  await client.query(`delete from public.groups where id = any($1)`, [[GROUP, GROUP_B]])
  await client.query(`delete from public.locations where id = any($1)`, [[LOC_A, LOC_B, LOC_FAR]])
  await client.query(`delete from public.member_follows where follower_member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.staff_assignments where member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.members where id = any($1)`, [MEMBERS])
  await client.query(`delete from auth.users where id = any($1)`, [MEMBERS])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const m of MEMBERS) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [m, `${m.slice(0, 8)}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [m, `u${m.slice(0, 8)}`])
  }
  for (const [m, role, revoked] of [[OWNER, 'owner', false], [ANALYST, 'analyst', false], [MODERATOR, 'moderator', false], [REVOKED, 'analyst', true]] as const) {
    await client.query(`insert into public.staff_assignments (member_id, role, revoked_at) values ($1,$2,$3)`, [m, role, revoked ? new Date() : null])
  }
})
afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('staff_can (#544)', () => {
  it('owner holds every permission', async () => {
    for (const p of ['metrics.view', 'reports.review', 'tags.review', 'builders.manage', 'unclaimed.manage']) expect(await can(OWNER, p), p).toBe(true)
  })
  it('an analyst reads metrics and nothing else', async () => {
    expect(await can(ANALYST, 'metrics.view')).toBe(true)
    for (const p of ['reports.review', 'tags.review', 'builders.manage', 'unclaimed.manage']) expect(await can(ANALYST, p), p).toBe(false)
  })
  it('a moderator reviews reports and tags, and cannot read metrics or manage builders', async () => {
    expect(await can(MODERATOR, 'reports.review')).toBe(true)
    expect(await can(MODERATOR, 'tags.review')).toBe(true)
    expect(await can(MODERATOR, 'metrics.view')).toBe(false)
    expect(await can(MODERATOR, 'builders.manage')).toBe(false)
  })
  it('a member with no role, a revoked role, a signed-out visitor and an unknown permission all get false', async () => {
    expect(await can(NOBODY, 'metrics.view')).toBe(false)
    expect(await can(REVOKED, 'metrics.view')).toBe(false)
    expect(await can(null, 'metrics.view')).toBe(false)
    expect(await can(OWNER, 'nothing.at.all')).toBe(false)
  })
  it('the role tables are readable by no member', async () => {
    await expect(as(NOBODY, `select * from public.staff_assignments`)).rejects.toThrow(/permission denied/)
    await expect(as(OWNER, `select * from public.staff_role_permissions`)).rejects.toThrow(/permission denied/)
  })
})

describe.skipIf(!RUNNABLE)('admin_metrics_weekly (#544)', () => {
  it('gives anyone without metrics.view no rows at all, a signed-out visitor included', async () => {
    expect(await weeks(NOBODY)).toEqual([])
    expect(await weeks(MODERATOR)).toEqual([])
    expect(await weeks(REVOKED)).toEqual([])
    expect(await as(null, `select * from public.admin_metrics_weekly(2)`)).toEqual([])
  })
  it('gives this week and last week, newest first, to an analyst', async () => {
    const r = await weeks(ANALYST)
    expect(r).toHaveLength(2)
    expect(new Date(r[0]!.week_start as string).getTime()).toBeGreaterThan(new Date(r[1]!.week_start as string).getTime())
  })
  it('counts gatherings, venues, newcomers and the unconnected from the rows, with the real small numbers', async () => {
    const before = (await weeks(OWNER))[0]!
    const metro = (await client.query(
      `select m.id, st_x(s.centroid::geometry) lng, st_y(s.centroid::geometry) lat from public.metro_polygons m
         join public.places s on s.kind = 'city' and s.display_name = 'Sacramento' and s.deleted_at is null
        where st_intersects(m.geography, s.centroid) limit 1`,
    )).rows[0]
    const here = (dx: number) => `st_setsrid(st_makepoint(${metro.lng + dx}, ${metro.lat}), 4326)::geography`
    for (const [lid, dx] of [[LOC_A, 0], [LOC_B, 0.001], [LOC_FAR, 30]] as const) {
      await client.query(`insert into public.locations (id, member_id, kind, label, slug, geography, discoverability) values ($1,$2,'permanent',$3,$4,${here(dx)},'listed')`, [lid, HOST, `T544 ${lid.slice(4, 8)}`, `t544-${lid.slice(4, 8)}`])
    }
    await client.query(`update public.members set home_metro_id = $1 where id = any($2)`, [metro.id, [NEW1, NEW2, NEW3, OLD1, OLD2, HOST]])
    await client.query(`update public.members set created_at = now() - interval '40 days' where id = any($1)`, [[OLD1, OLD2, HOST]])
    await client.query(`update public.members set created_at = now() where id = any($1)`, [[NEW1, NEW2, NEW3]])
    for (const [g, loc] of [[GROUP, LOC_A], [GROUP_B, LOC_B]] as const) {
      await client.query(`insert into public.groups (id, kind, purpose, name, slug, founder_member_id, lifecycle_state, discoverability, anchor_location_id) values ($1,'group','gather',$2,$3,$4,'active','listed',$5)`, [g, `T544 ${g.slice(4, 8)}`, `t544-g-${g.slice(4, 8)}`, HOST, loc])
    }
    // Two gatherings now: one at LOC_A (the Page's anchor), one at LOC_B (its own place); one far away; one undated; one next month.
    await client.query(`insert into public.page_posts (group_id, body, starts_at, location_id, lifecycle_state) values ($1,'a', now() + interval '1 hour', null, 'active'), ($1,'b', now() + interval '2 hour', $2, 'active'), ($1,'far', now() + interval '1 hour', $3, 'active'), ($1,'undated', null, null, 'active')`, [GROUP, LOC_B, LOC_FAR])
    // NEW1 follows a member within 14 days; NEW2 follows nothing; OLD1 follows someone; OLD2 has nothing.
    await client.query(`insert into public.member_follows (follower_member_id, followed_member_id) values ($1,$2), ($3,$2)`, [NEW1, HOST, OLD1])
    const after = (await weeks(OWNER))[0]!
    const d = (k: string) => Number(after[k]) - Number(before[k])
    expect(d('gatherings')).toBe(2)
    expect(d('venues')).toBe(2)
    expect(d('new_members')).toBe(3)
    expect(d('new_members_connected')).toBe(1)
    // Aged 14+ days and zero connections: OLD2 and HOST (HOST founded a Page but follows no one and holds no membership).
    expect(d('members_unconnected')).toBe(2)
    expect(d('members_total')).toBe(3)
  })
})
