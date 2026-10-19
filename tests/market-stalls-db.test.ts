import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { groupMarketStallSet, groupMarketStallSkip, groupMarketStallRemove, groupMarketStallConfirm, memberReminderEveryForPage, memberReminderSet } from '@/actions'
import { runReminders } from '@/lib/notify/push/reminder-sender'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

// #955 (Don, 2026-10-18: "Go") — a vendor Page attaches to a market Page with a schedule; only its managers edit it;
// "Remind me" on the vendor says when it is at the market, skipping a week cancels it, and the market's reminder lists
// who is coming.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a vendor attaches to a market, only its managers edit that, and reminders say who is there',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `9${String(n).padStart(7, '0')}-0000-4000-8000-000000000955`
const OWNER = id(1), DANA = id(2), EVE = id(3)
const VENDOR = id(10), MARKET = id(11), OTHER = id(12), SERIES = id(20), POST = id(30)
const pt = (s: string) => new Date(`${s}-07:00`)
const ctx = (m: string) => resolveActionContext({ actingMemberId: m })

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)

async function as<T>(sub: string | null, sql: string, p: unknown[] = []) {
  await q('begin')
  try {
    if (sub) await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q(`set local role ${sub ? 'authenticated' : 'anon'}`)
    const r = await q(sql, p)
    return { rows: r.rows as T[], count: r.rowCount ?? 0 }
  } catch (err) {
    return { error: (err as Error).message, rows: [] as T[], count: 0 }
  } finally {
    await q('rollback')
  }
}

async function cleanup() {
  await q(`delete from public.post_reminders where member_id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from public.market_stalls where vendor_group_id = any($1)`, [[VENDOR, OTHER]])
  await q(`delete from public.page_posts where group_id = $1`, [MARKET])
  await q(`delete from public.post_series where id = $1`, [SERIES])
  await q(`delete from public.group_memberships where group_id = any($1)`, [[VENDOR, MARKET, OTHER]])
  await q(`delete from public.groups where id = any($1)`, [[VENDOR, MARKET, OTHER]])
  await q(`delete from public.push_subscriptions where member_id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from public.members where id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from auth.users where id = any($1)`, [[OWNER, DANA, EVE]])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [m, h] of [[OWNER, 'owner'], [DANA, 'dana'], [EVE, 'eve']] as const) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [m, `m955-${h}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [m, `m955-${h}`])
  }
  for (const [g, name, founder, unclaimed] of [[VENDOR, 'Ito Farms', OWNER, false], [OTHER, 'Eve Bakes', EVE, false], [MARKET, 'Maidu Park Farmers Market', SYSTEM_MEMBER_ID, true]] as const) {
    await q(
      `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, unclaimed_at)
       values ($1,'business',$2,$3,'active','listed',$4, case when $5 then now() end)`,
      [g, name, `m955-${g.slice(0, 8)}`, founder, unclaimed],
    )
  }
  await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'owner'), ($3,$4,'owner')`, [VENDOR, OWNER, OTHER, EVE])
  await q(`insert into public.post_series (id, group_id, created_by, weekdays) values ($1,$2,$3,'{7}')`, [SERIES, MARKET, SYSTEM_MEMBER_ID])
  await q(
    `insert into public.page_posts (id, group_id, body, starts_at, ends_at, lifecycle_state, discoverability, series_id)
     values ($1,$2,'Market day.',$3,$4,'active','listed',$5)`,
    [POST, MARKET, pt('2026-10-25T09:00:00'), pt('2026-10-25T13:00:00'), SERIES],
  )
  await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/m955-dana','k','a','ios')`, [DANA])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

const send = async (at: Date) => {
  const pushed: string[] = []
  await runReminders(client, at, { push: async (_s, m) => (pushed.push(`${m.title}: ${m.body}`), 'ok' as const), email: async () => true })
  return pushed
}

describe.skipIf(!RUNNABLE)('#955 — a vendor at a market', () => {
  let stall = ''
  it('only the vendor Page’s managers attach it, every market day or on dates', async () => {
    await expect(groupMarketStallSet(ctx(DANA), { vendorGroupId: VENDOR, marketGroupId: MARKET, everyWeek: true, dates: [] })).rejects.toThrow(/managers/)
    await expect(groupMarketStallSet(ctx(OWNER), { vendorGroupId: VENDOR, marketGroupId: OTHER, everyWeek: true, dates: [] })).rejects.toThrow(/no market days/)
    await expect(groupMarketStallSet(ctx(OWNER), { vendorGroupId: VENDOR, marketGroupId: MARKET, everyWeek: false, dates: [] })).rejects.toThrow(/at least one date/)
    stall = (await groupMarketStallSet(ctx(OWNER), { vendorGroupId: VENDOR, marketGroupId: MARKET, everyWeek: true, dates: [] })).stallId
    expect((await groupMarketStallSet(ctx(OWNER), { vendorGroupId: VENDOR, marketGroupId: MARKET, everyWeek: true, dates: [] })).stallId).toBe(stall)
    await groupMarketStallSet(ctx(EVE), { vendorGroupId: OTHER, marketGroupId: MARKET, everyWeek: false, dates: ['2026-11-01'] })
  })

  it('RLS: anyone reads it; only the vendor’s managers write it', async () => {
    expect((await as(null, `select id from public.market_stalls where id = $1`, [stall])).rows).toHaveLength(1)
    expect((await as(DANA, `update public.market_stalls set every_week = false, dates = '{2026-11-01}' where id = $1`, [stall])).count).toBe(0)
    expect((await as(DANA, `delete from public.market_stalls where id = $1`, [stall])).count).toBe(0)
    expect((await as(DANA, `insert into public.market_stalls (vendor_group_id, market_group_id) values ($1, $2)`, [VENDOR, MARKET])).error).toMatch(/row-level security/)
    expect((await as(OWNER, `update public.market_stalls set updated_at = now() where id = $1`, [stall])).count).toBe(1)
  })

  it('Remind me on the vendor: the evening before, "They’re at the market tomorrow, 9–1"', async () => {
    await memberReminderEveryForPage(ctx(DANA), { groupId: VENDOR })
    expect(await send(pt('2026-10-24T18:05:00'))).toEqual(["Ito Farms: They're at Maidu Park Farmers Market tomorrow, 9–1."])
    expect(await send(pt('2026-10-24T18:20:00'))).toEqual([])
  })

  it('skipping a week cancels that one only', async () => {
    await expect(groupMarketStallSkip(ctx(DANA), { stallId: stall, date: '2026-11-01', skip: true })).rejects.toThrow(/managers/)
    await groupMarketStallSkip(ctx(OWNER), { stallId: stall, date: '2026-11-01', skip: true })
    expect(await send(pt('2026-10-31T18:05:00'))).toEqual([])
    expect(await send(new Date('2026-11-07T18:05:00-08:00'))).toHaveLength(1)
  })

  it('the market’s reminder lists who is coming that day', async () => {
    await memberReminderSet(ctx(DANA), { postId: POST, every: true })
    const sunday1 = await send(new Date('2026-11-14T18:05:00-08:00'))
    expect(sunday1.find((m) => m.startsWith('Maidu Park'))).toMatch(/Coming: Ito Farms\. Market day\./)
    await q(`delete from public.reminder_sends`)
  })

  it('an unclaimed market’s organiser can’t confirm; a claimed one confirms and removes', async () => {
    await expect(groupMarketStallConfirm(ctx(EVE), { stallId: stall })).rejects.toThrow(/market’s managers/)
    await q(`update public.groups set unclaimed_at = null where id = $1`, [MARKET])
    await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'owner')`, [MARKET, EVE])
    expect(await groupMarketStallConfirm(ctx(EVE), { stallId: stall })).toEqual({ confirmed: true })
    expect((await groupMarketStallRemove(ctx(EVE), { stallId: stall })).removed).toBe(true)
    expect((await q(`select 1 from public.post_reminders where stall_id = $1`, [stall])).rows).toHaveLength(0)
  })
})
