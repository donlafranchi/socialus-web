import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { memberReminderSet } from '@/actions/member/reminders'
import { runReminders } from '@/lib/notify/push/reminder-sender'
import { syncMarketDays, type MarketSchedule } from '@/lib/unclaimed/market-days'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

// Don, 2026-10-19 — Maidu Park Farmers Market: an unclaimed market's real Market day posts are a weekly series,
// three dates ahead, rolled on as each passes, and "Remind me every time" works on them.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "an unclaimed market's Market day posts stay three weeks ahead and can be reminded every time",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const DANA = 'a9000000-0000-4000-8000-000000000955'
const PAGE = 'c9000000-0000-4000-8000-000000000955'
const pt = (s: string) => new Date(`${s}-07:00`)
const maidu: MarketSchedule = { weekday: 7, start: '09:00', end: '13:00', hours: 'Sundays 9 AM–1 PM, year-round', source: 'https://www.bemoneysmartusa.org/copy-of-mahany-park-roseville' }

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)
const upcoming = async () =>
  (await q(`select starts_at, series_id, sample_kind from public.page_posts where group_id = $1 order by starts_at`, [PAGE])).rows as { starts_at: Date; series_id: string | null; sample_kind: string | null }[]

async function cleanup() {
  await q(`delete from public.post_reminders where member_id = $1`, [DANA])
  await q(`delete from public.page_posts where group_id = $1`, [PAGE])
  await q(`delete from public.post_series where group_id = $1`, [PAGE])
  await q(`delete from public.groups where id = $1`, [PAGE])
  await q(`delete from public.push_subscriptions where member_id = $1`, [DANA])
  await q(`delete from public.notification_prefs where member_id = $1`, [DANA])
  await q(`delete from public.members where id = $1`, [DANA])
  await q(`delete from auth.users where id = $1`, [DANA])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','m955-dana@test.invalid','x',now(),now(),now())`,
    [DANA],
  )
  await q(`insert into public.members (id, handle, display_name) values ($1,'m955-dana','Dana')`, [DANA])
  await q(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, unclaimed_at)
     values ($1,'business','M955 Market','m955-market','active','listed',$2, now())`,
    [PAGE, SYSTEM_MEMBER_ID],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('Market day posts on an unclaimed market', () => {
  it('are its next three Sundays, one weekly series, and not Samples; a second run writes nothing', async () => {
    expect(await syncMarketDays(client, PAGE, 'M955 Market', maidu, null, pt('2026-10-19T12:00:00'))).toBe(3)
    const posts = await upcoming()
    expect(posts.map((p) => p.starts_at.toISOString())).toEqual(['2026-10-25T16:00:00.000Z', '2026-11-01T17:00:00.000Z', '2026-11-08T17:00:00.000Z'])
    expect(new Set(posts.map((p) => p.series_id)).size).toBe(1)
    expect(posts.every((p) => p.series_id && p.sample_kind === null)).toBe(true)
    expect(await syncMarketDays(client, PAGE, 'M955 Market', maidu, null, pt('2026-10-19T12:00:00'))).toBe(0)
  })

  it('a passed Sunday moves on to the next one not yet posted', async () => {
    expect(await syncMarketDays(client, PAGE, 'M955 Market', maidu, null, pt('2026-10-26T12:00:00'))).toBe(1)
    expect((await upcoming()).map((p) => p.starts_at.toISOString())).toEqual(['2026-11-01T17:00:00.000Z', '2026-11-08T17:00:00.000Z', '2026-11-15T17:00:00.000Z'])
  })

  it('Remind me every time is taken, and the evening before it sends', async () => {
    const [first] = await upcoming()
    const post = (await q(`select id from public.page_posts where group_id = $1 and starts_at = $2`, [PAGE, first!.starts_at])).rows[0]!.id as string
    await memberReminderSet(resolveActionContext({ actingMemberId: DANA }), { postId: post, every: true })
    expect((await q(`select series_id from public.post_reminders where member_id = $1`, [DANA])).rows[0]!.series_id).toBe(first!.series_id)
    await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/m955','k','a','ios')`, [DANA])
    const pushed: string[] = []
    await runReminders(client, pt('2026-10-31T18:05:00'), { push: async (_s, m) => (pushed.push(`${m.title}: ${m.body}`), 'ok' as const), email: async () => true })
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatch(/^M955 Market: Tomorrow at 9:00 AM · Market day/)
  })
})
