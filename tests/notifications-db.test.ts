import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { runFollow, runWeekend, stats, weekendCounts } from '@/lib/notify/push/sender'
import type { PushMessage } from '@/lib/notify/push/rules'
import type { Subscription } from '@/lib/notify/push/send'

// #904 — opt-in web push against a real database: who can read what, which posts notify whom, batching and the
// daily cap, a dropped subscription, the weekly this-weekend, and counts with no member in them.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'push subscriptions are private, only opted-in followers are notified of real posts, batched and capped',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `9${String(n).padStart(7, '0')}-0000-4000-8000-000000000904`
const OWNER = id(1), FAN = id(2), SHY = id(3), OTHER = id(4)
const PAGE = id(10), PAGE2 = id(11), ANCHOR = id(20)
const SACRAMENTO = `select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)

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

function fakePush(gone: string[] = []) {
  const sent: { endpoint: string; m: PushMessage }[] = []
  const push = async (s: Subscription, m: PushMessage) => {
    if (gone.includes(s.endpoint)) return 'gone' as const
    sent.push({ endpoint: s.endpoint, m })
    return 'ok' as const
  }
  return { sent, push }
}

async function post(n: number, body: string, page = PAGE, opts: { sample?: boolean; at?: Date; starts?: Date } = {}) {
  await q(
    `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability, created_at, updated_at, sample_kind, starts_at)
     values ($1,$2,$3,'active','listed',$4,$4,$5,$6)`,
    [id(100 + n), page, body, opts.at ?? new Date(Date.now() - 5 * 60_000), opts.sample ? 'event' : null, opts.starts ?? null],
  )
}

const counts = async () =>
  (await q(`select kind, sends, opens, opt_ins, unsubscribes, mutes from public.notification_weekly where week_start = date_trunc('week', now() at time zone 'America/Los_Angeles')::date order by kind`)).rows

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [mid, h] of [[OWNER, 'n904-owner'], [FAN, 'n904-fan'], [SHY, 'n904-shy'], [OTHER, 'n904-other']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [mid, `${h}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [mid, h])
  }
  await q(`insert into public.locations (id, member_id, kind, label, slug, geography) values ($1,$2,'permanent','N904 Bakery','n904-bakery', ST_GeogFromText('POINT(-121.47 38.54)'))`, [ANCHOR, OWNER])
  for (const [gid, name] of [[PAGE, 'N904 Bakery'], [PAGE2, 'N904 Hall']]) {
    await q(
      `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business',$2,$3,'active','listed',$4,$5)`,
      [gid, name, name.toLowerCase().replace(' ', '-'), OWNER, ANCHOR],
    )
    await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'owner')`, [gid, OWNER])
  }
  // FAN and SHY follow both Pages; FAN opts in, SHY never does. The owner opts in too, and is never told of their own post.
  for (const m of [FAN, SHY]) for (const g of [PAGE, PAGE2]) await q(`insert into public.group_memberships (group_id, member_id, role, source) values ($1,$2,'member','soft_via_follow')`, [g, m])
  await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/fan-1','k','a','android'), ($1,'https://push.test/fan-2','k','a','desktop'), ($2,'https://push.test/shy','k','a','ios'), ($3,'https://push.test/owner','k','a','desktop')`, [FAN, SHY, OWNER])
  await q(`insert into public.notification_prefs (member_id, follow_posts, weekend, quiet_start, quiet_end) values ($1,true,true,0,0), ($2,false,false,0,0), ($3,true,false,0,0)`, [FAN, SHY, OWNER])
})

async function cleanup() {
  await q(`delete from public.page_tags where group_id = any($1)`, [[PAGE, PAGE2]])
  await q(`delete from public.page_posts where group_id = any($1)`, [[PAGE, PAGE2]])
  await q(`delete from public.group_memberships where group_id = any($1)`, [[PAGE, PAGE2]])
  await q(`delete from public.groups where id = any($1)`, [[PAGE, PAGE2]])
  await q(`delete from public.locations where id = $1`, [ANCHOR])
  await q(`delete from public.tags where created_by = any($1)`, [[OWNER]])
  await q(`delete from public.members where id = any($1)`, [[OWNER, FAN, SHY, OTHER]])
  await q(`delete from auth.users where id = any($1)`, [[OWNER, FAN, SHY, OTHER]])
}

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await q(`delete from public.page_posts where group_id = any($1)`, [[PAGE, PAGE2]])
  await q(`delete from public.notification_sends where member_id = any($1)`, [[OWNER, FAN, SHY]])
  await q(`update public.notification_cursor set read_to = now() - interval '1 hour'`)
})

describe.skipIf(!RUNNABLE)('#904 — who reads what', () => {
  it('nobody reads a push subscription through the API, not even its own member', async () => {
    expect(String(await as(FAN, `select * from public.push_subscriptions`))).toMatch(/permission denied/)
    expect(String(await as(null, `select * from public.push_subscriptions`))).toMatch(/permission denied/)
  })
  it('a member reads their own choices and nobody else’s', async () => {
    expect(await as<{ member_id: string }>(FAN, `select member_id from public.notification_prefs`)).toEqual([{ member_id: FAN }])
    expect(String(await as(null, `select * from public.notification_prefs`))).toMatch(/permission denied/)
  })
  it('the queue, the send log and the counts are closed to the API', async () => {
    for (const t of ['notification_queue', 'notification_sends', 'notification_weekly', 'notification_cursor']) {
      expect(String(await as(FAN, `select * from public.${t}`))).toMatch(/permission denied/)
    }
  })
  // Checked as a privilege, not by calling it as a member: that call crashes this Postgres build's backend.
  it('neither a member nor a visitor can add to the counts', async () => {
    for (const role of ['authenticated', 'anon']) {
      const r = await q(`select has_function_privilege($1, 'public.notification_count(text, text, integer)', 'execute') as ok`, [role])
      expect(r.rows[0].ok).toBe(false)
    }
  })
})

describe.skipIf(!RUNNABLE)('#904 — new posts from Pages I follow', () => {
  it('a real post notifies the opted-in follower on each of their devices; not the shy follower, not the owner', async () => {
    await post(1, 'Fresh sourdough at 7')
    const { sent, push } = fakePush()
    const r = await runFollow(client, new Date(), push)
    expect(r.queued).toBe(1)
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push.test/fan-1', 'https://push.test/fan-2'])
    expect(sent[0]!.m).toMatchObject({ title: 'N904 Bakery', body: 'Fresh sourdough at 7' })
  })
  it('a sample post notifies nobody', async () => {
    await post(2, 'Sample: an event', PAGE, { sample: true })
    const { sent, push } = fakePush()
    expect((await runFollow(client, new Date(), push)).queued).toBe(0)
    expect(sent).toHaveLength(0)
  })
  it('three posts in one run become one notification', async () => {
    await post(3, 'One'); await post(4, 'Two', PAGE2); await post(5, 'Three')
    const { sent, push } = fakePush()
    await runFollow(client, new Date(), push)
    expect(new Set(sent.map((s) => s.m.title))).toEqual(new Set(['3 new posts from Pages you follow']))
    expect((await q(`select count(*)::int as n from public.notification_queue where member_id = $1`, [FAN])).rows[0].n).toBe(0)
  })
  it('after 3 today, the next waits in the queue', async () => {
    await q(`insert into public.notification_sends (member_id, kind, sent_at) select $1, 'follow_posts', now() - (n || ' hours')::interval from generate_series(1, 3) n`, [FAN])
    await post(6, 'Fourth today')
    const { sent, push } = fakePush()
    expect(await runFollow(client, new Date(), push)).toMatchObject({ sent: 0, held: 1 })
    expect(sent).toHaveLength(0)
    await q(`delete from public.notification_queue where member_id = $1`, [FAN])
  })
  it('in quiet hours it waits; a post taken down meanwhile is never sent', async () => {
    await q(`update public.notification_prefs set quiet_start = 0, quiet_end = 23 where member_id = $1`, [FAN])
    const now = new Date('2026-10-22T12:00:00-07:00')
    await q(`update public.notification_cursor set read_to = $1::timestamptz - interval '1 hour'`, [now])
    await post(7, 'Quiet please', PAGE, { at: new Date(now.getTime() - 60_000) })
    const { sent, push } = fakePush()
    expect(await runFollow(client, now, push)).toMatchObject({ queued: 1, sent: 0, held: 1 })
    await q(`update public.page_posts set hidden_at = now(), hidden_prior_discoverability = 'listed' where id = $1`, [id(107)])
    await q(`update public.notification_prefs set quiet_start = 0, quiet_end = 0 where member_id = $1`, [FAN])
    expect(await runFollow(client, now, push)).toMatchObject({ sent: 0, dropped: 1 })
    expect(sent).toHaveLength(0)
  })
  it('a subscription the browser dropped is deleted', async () => {
    await post(8, 'Hello')
    const { sent, push } = fakePush(['https://push.test/fan-2'])
    await runFollow(client, new Date(), push)
    expect(sent.map((s) => s.endpoint)).toEqual(['https://push.test/fan-1'])
    expect((await q(`select endpoint from public.push_subscriptions where member_id = $1`, [FAN])).rows).toEqual([{ endpoint: 'https://push.test/fan-1' }])
    await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/fan-2','k','a','desktop')`, [FAN])
  })
})

describe.skipIf(!RUNNABLE)('#904 — this weekend near me', () => {
  const THURSDAY = new Date('2026-10-22T18:00:00-07:00')
  const SATURDAY = new Date('2026-10-24T10:00:00-07:00')
  it('counts followed Pages’ posts on this weekend, and posts in the area matching an interest', async () => {
    await q(`update public.members set default_metro_id = (${SACRAMENTO}) where id = $1`, [FAN])
    await post(20, 'Saturday market', PAGE, { starts: SATURDAY })
    await post(21, 'Next month', PAGE, { starts: new Date('2026-11-21T10:00:00-08:00') })
    expect(await weekendCounts(client, FAN, THURSDAY)).toEqual({ total: 1, followed: 1 })
    // A Page FAN doesn't follow, tagged with one of FAN's interests, in their metro.
    await q(`delete from public.group_memberships where group_id = $1 and member_id = $2`, [PAGE2, FAN])
    await post(22, 'Live music Sunday', PAGE2, { starts: new Date('2026-10-25T19:00:00-07:00') })
    expect(await weekendCounts(client, FAN, THURSDAY)).toEqual({ total: 1, followed: 1 })
    await q(`insert into public.tags (label, normalized, created_by) values ('Live music', 'live music', $1) on conflict (normalized) do nothing`, [OWNER])
    await q(`insert into public.page_tags (group_id, tag_id) select $1, id from public.tags where normalized = 'live music'`, [PAGE2])
    await q(`insert into public.member_interests (member_id, tag) values ($1, 'live-music')`, [FAN])
    expect(await weekendCounts(client, FAN, THURSDAY)).toEqual({ total: 2, followed: 1 })
    await q(`delete from public.page_tags where group_id = $1`, [PAGE2])
    await q(`delete from public.member_interests where member_id = $1`, [FAN])
    await q(`insert into public.group_memberships (group_id, member_id, role, source) values ($1,$2,'member','soft_via_follow') on conflict (group_id, member_id) do update set left_at = null`, [PAGE2, FAN])
  })
  it('sends once a week, only to members who turned it on', async () => {
    await post(23, 'Saturday market', PAGE, { starts: SATURDAY })
    const { sent, push } = fakePush()
    expect(await runWeekend(client, THURSDAY, push)).toMatchObject({ sent: 1 })
    expect(sent[0]!.m).toMatchObject({ kind: 'weekend', title: 'This weekend near you', body: '1 thing on, 1 from Pages you follow.' })
    expect(await runWeekend(client, THURSDAY, push)).toMatchObject({ members: 0, sent: 0 })
  })
})

describe.skipIf(!RUNNABLE)('#904 — counts only', () => {
  it('sends are counted per kind per week, and the snapshot has no member in it', async () => {
    const before = await counts()
    await post(30, 'Counted')
    await runFollow(client, new Date(), fakePush().push)
    const after = await counts()
    const sends = (rows: { kind: string; sends: number }[]) => rows.find((r) => r.kind === 'follow_posts')?.sends ?? 0
    expect(sends(after) - sends(before)).toBe(1)
    const rows = await stats(client)
    expect(Object.keys(rows[0]!).sort()).toEqual(['kind', 'members', 'mutes', 'opens', 'opt_ins', 'opted_in_members', 'sends', 'unsubscribes', 'week'])
  })
})
