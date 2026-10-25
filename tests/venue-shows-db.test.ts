import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { memberReminderSet } from '@/actions/member/reminders'
import { runReminders } from '@/lib/notify/push/reminder-sender'
import { syncVenueShows, remindVenueFollowers, type VenueShow } from '@/lib/unclaimed/venue-events'
import { memberReminderEveryForPage } from '@/actions/member/reminders'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

// #997 (Don, 2026-10-22) — a venue's real shows, imported from its own calendar: one post per night and title, updated
// in place, cancelled and over ones off, and "Remind me every time" on the venue reminds each show, imported ones too.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a venue's imported shows are upserted, pruned and reminded",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const DANA = 'a9000000-0000-4000-8000-000000000997'
const PAGE = 'c9000000-0000-4000-8000-000000000997'
const pt = (s: string) => new Date(`${s}-07:00`)
const SRC = 'https://venue.test/events'
const show = (title: string, at: string, extra: Partial<VenueShow> = {}): VenueShow => ({ title, startsAt: pt(at), ticketUrl: 'https://venue.test/t/' + title.length, ...extra })

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)
const upcoming = async () =>
  (await q(`select id, starts_at, body, event_key, ticket_url, sample_kind from public.page_posts where group_id = $1 order by starts_at`, [PAGE])).rows as { id: string; starts_at: Date; body: string; event_key: string; ticket_url: string | null; sample_kind: string | null }[]

async function cleanup() {
  await q(`delete from public.post_reminders where member_id = $1`, [DANA])
  await q(`delete from public.post_tags where post_id in (select id from public.page_posts where group_id = $1)`, [PAGE])
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
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','m997-dana@test.invalid','x',now(),now(),now())`,
    [DANA],
  )
  await q(`insert into public.members (id, handle, display_name) values ($1,'m997-dana','Dana')`, [DANA])
  await q(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, unclaimed_at)
     values ($1,'business','M997 Venue','m997-market','active','listed',$2, now())`,
    [PAGE, SYSTEM_MEMBER_ID],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('A venue Page\'s imported shows', () => {
  const now = pt('2026-10-22T09:00:00')
  // handlers read ctx.now() = real Date; freeze it so the fixed show dates never go stale
  afterEach(() => vi.useRealTimers())
  it('posts what is ahead as real posts with a ticket link; a second run changes nothing', async () => {
    const shows = [show('Modest Mouse', '2026-10-23T20:00:00'), show('Old Show', '2026-10-21T20:00:00'), show('Too Far', '2027-02-01T20:00:00'), show('Called Off', '2026-10-30T20:00:00', { cancelled: true })]
    expect(await syncVenueShows(client, PAGE, 'M997 Venue', SRC, shows, null, now)).toEqual({ added: 1, updated: 0, removed: 0, kept: 0 })
    const [p] = await upcoming()
    expect(p).toMatchObject({ event_key: '2026-10-23|modest mouse', sample_kind: null, ticket_url: 'https://venue.test/t/12' })
    expect(p!.body).toBe("Modest Mouse at M997 Venue\n\nShow 8 PM\n\nFrom M997 Venue's own calendar: " + SRC)
    expect(await syncVenueShows(client, PAGE, 'M997 Venue', SRC, shows, null, now)).toEqual({ added: 0, updated: 0, removed: 0, kept: 1 })
  })

  it('a game gets arena stock and sports tags, a concert the venue\'s own picture, and a re-run keeps both (#1045)', async () => {
    const photoFor = async (_s: VenueShow, _k: string, type: string) => (type === 'sports' ? { url: 'https://media.test/arena.webp', credit: 'Unsplash (stock photo, not this business)' } : { url: 'https://media.test/promo.webp', credit: 'M997 Venue (from their website)' })
    const shows = [show('Grizzlies vs Kings', '2026-10-25T18:00:00'), show('Karan Aujla', '2026-10-26T20:00:00')]
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, shows, 'https://media.test/page-cover.webp', now, { venueInterests: ['Live music'], photoFor })
    const rows = (await q(`select event_key, photo_url, body from public.page_posts where group_id = $1 order by starts_at`, [PAGE])).rows
    expect(rows.map((r) => [r.event_key, r.photo_url])).toEqual([['2026-10-25|grizzlies vs kings', 'https://media.test/arena.webp'], ['2026-10-26|karan aujla', 'https://media.test/promo.webp']])
    expect(rows[0].body).toMatch(/\n\nPhoto: Unsplash \(stock photo, not this business\)$/)
    const tags = async () => (await q(`select p.event_key, array_agg(t.label order by t.label) labels from public.post_tags pt join public.page_posts p on p.id = pt.post_id join public.tags t on t.id = pt.tag_id where p.group_id = $1 group by 1 order by 1`, [PAGE])).rows
    expect(await tags()).toEqual([{ event_key: '2026-10-25|grizzlies vs kings', labels: ['Fitness & outdoors', 'Sports'] }, { event_key: '2026-10-26|karan aujla', labels: ['Live music'] }])
    const again = vi.fn(photoFor)
    expect(await syncVenueShows(client, PAGE, 'M997 Venue', SRC, shows, 'https://media.test/page-cover.webp', now, { venueInterests: ['Live music'], photoFor: again })).toEqual({ added: 0, updated: 0, removed: 0, kept: 2 })
    expect(again).not.toHaveBeenCalled()
  })

  it('a show already on the Page cover is given a fitting picture on the next run (the Kings backfill)', async () => {
    const cover = 'https://media.test/page-cover.webp'
    await q(`delete from public.page_posts where group_id = $1`, [PAGE])
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Grizzlies vs Kings', '2026-10-25T18:00:00')], cover, now)
    expect((await upcoming()).length).toBe(1)
    const t = await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Grizzlies vs Kings', '2026-10-25T18:00:00')], cover, now, { photoFor: async () => ({ url: 'https://media.test/arena.webp', credit: 'Unsplash (stock photo, not this business)' }) })
    expect(t.updated).toBe(1)
    expect((await q(`select photo_url from public.page_posts where group_id = $1`, [PAGE])).rows[0].photo_url).toBe('https://media.test/arena.webp')
  })

  it('a moved show is updated in place; a dropped or cancelled one comes off; a past one comes off', async () => {
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Modest Mouse', '2026-10-23T21:00:00'), show('Second', '2026-10-24T20:00:00')], null, now)
    expect((await upcoming()).map((p) => [p.event_key, p.starts_at.toISOString()])).toEqual([['2026-10-23|modest mouse', '2026-10-24T04:00:00.000Z'], ['2026-10-24|second', '2026-10-25T03:00:00.000Z']])
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Modest Mouse', '2026-10-23T21:00:00'), show('Second', '2026-10-24T20:00:00', { cancelled: true })], null, now)
    expect((await upcoming()).map((p) => p.event_key)).toEqual(['2026-10-23|modest mouse'])
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Third', '2026-10-31T20:00:00')], null, pt('2026-10-24T12:00:00'))
    expect((await upcoming()).map((p) => p.event_key)).toEqual(['2026-10-31|third'])
  })

  it('Remind me every time on the venue covers each show, the ones imported later too, and the evening before it sends', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Modest Mouse', '2026-10-23T20:00:00')], null, now)
    const ctx = resolveActionContext({ actingMemberId: DANA })
    expect((await memberReminderEveryForPage(ctx, { groupId: PAGE })).added).toBe(1)
    await syncVenueShows(client, PAGE, 'M997 Venue', SRC, [show('Modest Mouse', '2026-10-23T20:00:00'), show('Next Week', '2026-10-30T20:00:00')], null, now)
    expect(await remindVenueFollowers(client, PAGE, now)).toBe(1)
    expect(await remindVenueFollowers(client, PAGE, now)).toBe(0)
    const { rows } = await q(`select post_id, shows_group_id from public.post_reminders where member_id = $1`, [DANA])
    expect(rows.filter((r) => r.post_id)).toHaveLength(2)
    expect(rows.filter((r) => r.shows_group_id === PAGE)).toHaveLength(1)
    await q(`insert into public.push_subscriptions (member_id, endpoint, p256dh, auth, platform) values ($1,'https://push.test/m997','k','a','ios')`, [DANA])
    const pushed: string[] = []
    const send = { push: async (_s: unknown, m: { title: string; body: string }) => (pushed.push(`${m.title}: ${m.body}`), 'ok' as const), email: async () => true }
    await runReminders(client, pt('2026-10-22T18:05:00'), send)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]).toMatch(/^M997 Venue: Tomorrow at 8:00 PM · Modest Mouse at M997 Venue/)
    await runReminders(client, pt('2026-10-23T19:05:00'), send)
    expect(pushed).toHaveLength(2)
  })
})
