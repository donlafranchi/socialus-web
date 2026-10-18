import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { memberReminderSet, memberReminderRemove, memberReminderEveryForPage } from '@/actions/member/reminders'
import { runReminders } from '@/lib/notify/push/reminder-sender'
import type { PushMessage } from '@/lib/notify/push/rules'
import type { Subscription } from '@/lib/notify/push/send'

// #945 — Remind me against a real database: who reads a reminder, what can be reminded, this one or every time,
// the one tap on a Page that repeats, and the sender: push first, email otherwise, each reminder once, counts only.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'reminders are private, only real dated posts can be reminded, and each goes once by push or email',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `9${String(n).padStart(7, '0')}-0000-4000-8000-000000000945`
const OWNER = id(1), DANA = id(2), EVE = id(3)
const PAGE = id(10), PLAIN = id(11), SERIES = id(20)
const MARKET = id(100), UNDATED = id(101), SAMPLE = id(102), CONCERT = id(103)
const pt = (s: string) => new Date(`${s}-07:00`)
const SUNDAY_8 = pt('2026-10-25T08:00:00')

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)
const ctx = (m: string) => resolveActionContext({ actingMemberId: m })

async function as<T>(sub: string | null, sql: string) {
  await q('begin')
  try {
    if (sub) await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await q(sql)).rows as T[]
  } catch (err) {
    return (err as Error).message as unknown as T[]
  } finally {
    await q('rollback')
  }
}

function channels() {
  const pushed: { endpoint: string; m: PushMessage }[] = []
  const emailed: { to: string; subject: string; text: string }[] = []
  return {
    pushed,
    emailed,
    push: async (s: Subscription, m: PushMessage) => (pushed.push({ endpoint: s.endpoint, m }), 'ok' as const),
    email: async (to: string, subject: string, text: string) => (emailed.push({ to, subject, text }), true),
  }
}

async function cleanup() {
  await q(`delete from public.post_reminders where member_id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from public.page_posts where group_id = any($1)`, [[PAGE, PLAIN]])
  await q(`delete from public.post_series where id = $1`, [SERIES])
  await q(`delete from public.group_memberships where group_id = any($1)`, [[PAGE, PLAIN]])
  await q(`delete from public.groups where id = any($1)`, [[PAGE, PLAIN]])
  await q(`delete from public.notification_prefs where member_id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from public.push_subscriptions where member_id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from public.members where id = any($1)`, [[OWNER, DANA, EVE]])
  await q(`delete from auth.users where id = any($1)`, [[OWNER, DANA, EVE]])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [mid, h] of [[OWNER, 'r945-owner'], [DANA, 'r945-dana'], [EVE, 'r945-eve']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [mid, `${h}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [mid, h])
  }
  for (const [gid, name] of [[PAGE, 'Maidu Park Farmers Market'], [PLAIN, 'R945 Hall']]) {
    await q(`insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id) values ($1,'interest',$2,$3,'active','listed',$4)`, [gid, name, `r945-${gid.slice(0, 8)}`, OWNER])
    await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [gid, OWNER])
  }
  await q(`insert into public.post_series (id, group_id, created_by, weekdays) values ($1,$2,$3,'{7}')`, [SERIES, PAGE, OWNER])
  const post = `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability, starts_at, ends_at, series_id, sample_kind) values ($1,$2,$3,'active','listed',$4,$5,$6,$7)`
  await q(post, [MARKET, PAGE, 'Every Sunday, 8 to 1. Peaches are back.', pt('2026-10-18T08:00:00'), pt('2026-10-18T13:00:00'), SERIES, null])
  await q(post, [UNDATED, PLAIN, 'We are open.', null, null, null, null])
  await q(post, [SAMPLE, PLAIN, 'Sample: an event', SUNDAY_8, null, null, 'event'])
  await q(post, [CONCERT, PLAIN, 'Concert in the hall', pt('2026-10-24T19:00:00'), null, null, null])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await q(`delete from public.post_reminders where member_id = any($1)`, [[DANA, EVE]])
  await q(`delete from public.notification_prefs where member_id = any($1)`, [[DANA, EVE]])
  await q(`delete from public.push_subscriptions where member_id = any($1)`, [[DANA, EVE]])
})

describe.skipIf(!RUNNABLE)('#945 — setting a reminder', () => {
  it('one post: Remind me saves a private reminder, and asking twice keeps one', async () => {
    const a = await memberReminderSet(ctx(DANA), { postId: CONCERT, every: false })
    const b = await memberReminderSet(ctx(DANA), { postId: CONCERT, every: false })
    expect(b.reminderId).toBe(a.reminderId)
    expect((await q(`select post_id, series_id from public.post_reminders where member_id = $1`, [DANA])).rows).toEqual([{ post_id: CONCERT, series_id: null }])
  })
  it('a post that repeats: every time follows the series', async () => {
    await memberReminderSet(ctx(DANA), { postId: MARKET, every: true })
    expect((await q(`select post_id, series_id from public.post_reminders where member_id = $1`, [DANA])).rows).toEqual([{ post_id: null, series_id: SERIES }])
  })
  it('every time on a post that does not repeat is refused', async () => {
    await expect(memberReminderSet(ctx(DANA), { postId: CONCERT, every: true })).rejects.toThrow(/repeat/i)
  })
  it('a post with no date, or a sample, has nothing to remind', async () => {
    await expect(memberReminderSet(ctx(DANA), { postId: UNDATED, every: false })).rejects.toThrow()
    await expect(memberReminderSet(ctx(DANA), { postId: SAMPLE, every: false })).rejects.toThrow()
  })
  it('signed out, nothing is saved', async () => {
    await expect(memberReminderSet(resolveActionContext({ actingMemberId: '' }), { postId: CONCERT, every: false })).rejects.toThrow()
  })
  it('only its member removes a reminder', async () => {
    const { reminderId } = await memberReminderSet(ctx(DANA), { postId: CONCERT, every: false })
    expect(await memberReminderRemove(ctx(EVE), { reminderId })).toEqual({ removed: false })
    expect(await memberReminderRemove(ctx(DANA), { reminderId })).toEqual({ removed: true })
  })
  it('following a Page that repeats: one tap reminds every time', async () => {
    expect(await memberReminderEveryForPage(ctx(DANA), { groupId: PAGE })).toEqual({ added: 1 })
    expect(await memberReminderEveryForPage(ctx(DANA), { groupId: PAGE })).toEqual({ added: 0 })
    expect(await memberReminderEveryForPage(ctx(DANA), { groupId: PLAIN })).toEqual({ added: 0 })
  })
})

describe.skipIf(!RUNNABLE)('#945 — who reads a reminder', () => {
  it('a member reads their own; another member, the Page owner and a visitor read none', async () => {
    await memberReminderSet(ctx(DANA), { postId: CONCERT, every: false })
    expect(await as(DANA, `select id from public.post_reminders`)).toHaveLength(1)
    expect(await as(EVE, `select id from public.post_reminders`)).toHaveLength(0)
    expect(await as(OWNER, `select id from public.post_reminders`)).toHaveLength(0)
    expect(String(await as(null, `select id from public.post_reminders`))).toMatch(/permission denied/)
    expect(String(await as(DANA, `select * from public.reminder_sends`))).toMatch(/permission denied/)
  })
})

describe.skipIf(!RUNNABLE)('#945 — sending', () => {
  it('every Sunday: push the evening before at 6 pm, once, then 1 hour before', async () => {
    await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/dana','k','a','ios')`, [DANA])
    await memberReminderSet(ctx(DANA), { postId: MARKET, every: true })
    const c = channels()
    await runReminders(client, pt('2026-10-24T17:55:00'), c)
    expect(c.pushed).toHaveLength(0)
    await runReminders(client, pt('2026-10-24T18:05:00'), c)
    await runReminders(client, pt('2026-10-24T18:20:00'), c)
    expect(c.pushed.map((p) => p.m.body)).toEqual(['Tomorrow at 8:00 AM · Every Sunday, 8 to 1. Peaches are back.'])
    expect(c.pushed[0]!.m.title).toBe('Maidu Park Farmers Market')
    // 7:05 is inside the default quiet hours (9 pm–8 am): held, then the start passes, so nothing.
    await runReminders(client, pt('2026-10-25T07:05:00'), c)
    expect(c.pushed).toHaveLength(1)
    await q(`insert into public.notification_prefs (member_id, quiet_start, quiet_end) values ($1, 0, 0)`, [DANA])
    await runReminders(client, pt('2026-10-25T07:05:00'), c)
    expect(c.pushed.map((p) => p.m.body.split(' · ')[0])).toEqual(['Tomorrow at 8:00 AM', 'In an hour, at 8:00 AM'])
    expect(c.emailed).toHaveLength(0)
  })
  it('no notifications turned on anywhere: the reminder goes by email, with a way to stop it', async () => {
    await memberReminderSet(ctx(EVE), { postId: CONCERT, every: false })
    const c = channels()
    await runReminders(client, pt('2026-10-23T18:01:00'), c)
    expect(c.pushed).toHaveLength(0)
    expect(c.emailed).toEqual([expect.objectContaining({ to: 'r945-eve@test.invalid', subject: 'Tomorrow at 7:00 PM: R945 Hall' })])
    expect(c.emailed[0]!.text).toMatch(/via=reminder&r=/)
  })
  it('pause all holds every reminder; a timing turned off is skipped', async () => {
    await memberReminderSet(ctx(EVE), { postId: CONCERT, every: false })
    await q(`insert into public.notification_prefs (member_id, paused) values ($1, true)`, [EVE])
    const c = channels()
    await runReminders(client, pt('2026-10-23T18:01:00'), c)
    await q(`update public.notification_prefs set paused = false, remind_evening = false where member_id = $1`, [EVE])
    await runReminders(client, pt('2026-10-23T18:30:00'), c)
    expect(c.emailed).toHaveLength(0)
  })
  it('a post taken down is not reminded', async () => {
    await memberReminderSet(ctx(EVE), { postId: CONCERT, every: false })
    await q(`update public.page_posts set hidden_at = now(), hidden_prior_discoverability = 'listed' where id = $1`, [CONCERT])
    const c = channels()
    await runReminders(client, pt('2026-10-23T18:01:00'), c)
    await q(`update public.page_posts set hidden_at = null, hidden_prior_discoverability = null where id = $1`, [CONCERT])
    expect(c.emailed).toHaveLength(0)
  })
  it('counted as reminders: set, removed, sent and how many by email, with no member in the counts', async () => {
    const week = (now: Date) => q(`select sends, emails, opt_ins, unsubscribes from public.notification_weekly where kind = 'reminder' and week_start = date_trunc('week', $1::timestamptz at time zone 'America/Los_Angeles')::date`, [now])
    const before = (await week(new Date())).rows[0] ?? { sends: 0, emails: 0, opt_ins: 0, unsubscribes: 0 }
    const { reminderId } = await memberReminderSet(ctx(EVE), { postId: CONCERT, every: false })
    await runReminders(client, pt('2026-10-23T18:01:00'), channels())
    await memberReminderRemove(ctx(EVE), { reminderId })
    const after = (await week(new Date())).rows[0]!
    expect([after.opt_ins - before.opt_ins, after.unsubscribes - before.unsubscribes, after.sends - before.sends, after.emails - before.emails]).toEqual([1, 1, 1, 1])
  })
})
