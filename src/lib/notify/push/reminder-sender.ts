// #945 — the reminder sender, run with the follow sender every 15 minutes (scripts/notify/run.ts). For each reminder,
// the occurrences starting in the next two days: a one-off post's own time, or a series' weekdays at its first post's
// time (and any rows #593 later makes for it). Push where the member has a device, else email; each slot once.

import type { Client, PoolClient } from 'pg'
import { dueSlot, reminderEmail, reminderMessage, reminderUrl, seriesOccurrences, type ReminderFacts, type ReminderPrefs, type Slot } from './reminders'
import { sendPush, type SendResult, type Subscription } from './send'
import { sendMemberEmail } from '../email'
import type { PushMessage } from './rules'
import { METRO_TIME_ZONE } from '../../metro/metro-time'
import { metroDate } from '../../metro/metro-week'
import { attends, stallReminderBody, vendorsLine } from '../../markets/stalls'

type Db = Pick<Client | PoolClient, 'query'>
export interface Channels {
  push?: (sub: Subscription, m: PushMessage) => Promise<SendResult>
  email?: (to: string, subject: string, text: string, unsubscribe: string) => Promise<boolean>
  site?: string
}

const AHEAD_MS = 2 * 24 * 60 * 60 * 1000

type Row = {
  reminder_id: string
  member_id: string
  email: string | null
  post_id: string | null
  series_id: string | null
  body: string
  starts_at: Date
  ends_at: Date | null
  weekdays: number[] | null
  starts_on: string | null
  ends_on: string | null
  group_id: string
  name: string
  public_id: string
  remind_evening: boolean | null
  remind_hour: boolean | null
  paused: boolean | null
  quiet_start: number | null
  quiet_end: number | null
}

export async function runReminders(db: Db, now: Date, ch: Channels = {}): Promise<{ due: number; pushed: number; emailed: number; undelivered: number }> {
  const push = ch.push ?? ((s, m) => sendPush(s, m))
  const email = ch.email ?? ((to, subject, text, unsubscribe) => sendMemberEmail(to, subject, text, { unsubscribe }))
  const site = ch.site ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://socialus.org'
  const until = new Date(now.getTime() + AHEAD_MS)
  // One row per reminder: a one-off post, or a series and its first live post (the time of day and length it repeats).
  const rows = (
    await db.query<Row>(
      `select r.id as reminder_id, r.member_id, u.email, r.post_id, r.series_id,
              p.body, p.starts_at, p.ends_at, s.weekdays, to_char(s.starts_on, 'YYYY-MM-DD') as starts_on, to_char(s.ends_on, 'YYYY-MM-DD') as ends_on,
              g.id as group_id, g.name, g.public_id, pr.remind_evening, pr.remind_hour, pr.paused, pr.quiet_start, pr.quiet_end
         from public.post_reminders r
         join public.members m on m.id = r.member_id and m.deleted_at is null
         left join auth.users u on u.id = r.member_id
         left join public.post_series s on s.id = r.series_id
         join lateral (
           select pp.* from public.page_posts pp
            where (pp.id = r.post_id or pp.series_id = r.series_id)
              and pp.sample_kind is null and pp.lifecycle_state = 'active' and pp.dissolved_at is null
              and pp.hidden_at is null and pp.removed_at is null and pp.starts_at is not null
            order by pp.starts_at
            limit 1
         ) p on true
         join public.groups g on g.id = p.group_id and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
         left join public.notification_prefs pr on pr.member_id = r.member_id
        where (r.post_id is null or (p.starts_at >= $1 and p.starts_at < $2))`,
      [now, until],
    )
  ).rows
  let due = 0, pushed = 0, emailed = 0, undelivered = 0
  for (const r of rows) {
    const prefs: ReminderPrefs = {
      remindEvening: r.remind_evening ?? true,
      remindHour: r.remind_hour ?? true,
      paused: r.paused ?? false,
      quietStart: r.quiet_start ?? 21,
      quietEnd: r.quiet_end ?? 8,
    }
    const occurrences = r.series_id
      ? seriesOccurrences({ weekdays: r.weekdays ?? [], startsOn: r.starts_on, endsOn: r.ends_on }, { startsAt: new Date(r.starts_at), endsAt: r.ends_at ? new Date(r.ends_at) : null }, now, until)
      : [{ startsAt: new Date(r.starts_at), endsAt: r.ends_at }]
    const stalls = r.series_id ? await stallsAt(db, r.group_id) : []
    for (const o of occurrences) {
      const coming = vendorsLine(stalls.filter((x) => attends(x, metroDate(o.startsAt, METRO_TIME_ZONE))).map((x) => x.name))
      const sent = new Set(
        (await db.query<{ slot: Slot }>(`select slot from public.reminder_sends where reminder_id = $1 and occurs_at = $2`, [r.reminder_id, o.startsAt])).rows.map((x) => x.slot),
      )
      const slot = dueSlot(o.startsAt, now, prefs, sent)
      if (!slot) continue
      due++
      const facts: ReminderFacts = { reminderId: r.reminder_id, pageName: r.name, pagePublicId: r.public_id, body: coming ? `${coming} ${r.body}` : r.body, occursAt: o.startsAt }
      const how = await deliver(db, r, slot, facts, push, email, site)
      if (how === 'none') {
        undelivered++
        continue
      }
      if (how === 'push') pushed++
      else emailed++
      await db.query(`insert into public.reminder_sends (reminder_id, occurs_at, slot) values ($1, $2, $3) on conflict do nothing`, [r.reminder_id, o.startsAt, slot])
      await db.query(`select public.notification_count('reminder', 'sends', 1)`)
      if (how === 'email') await db.query(`select public.notification_count('reminder', 'emails', 1)`)
    }
  }
  const st = await runStallReminders(db, now, until, push, email, site)
  return { due: due + st.due, pushed: pushed + st.pushed, emailed: emailed + st.emailed, undelivered: undelivered + st.undelivered }
}

/** #955 — the vendors coming to a market, with when each comes. */
const stallsAt = async (db: Db, marketId: string) =>
  (
    await db.query<{ name: string; every_week: boolean; dates: string[]; skip_dates: string[] }>(
      `select v.name, s.every_week, s.dates::text[] as dates, s.skip_dates::text[] as skip_dates
         from public.market_stalls s join public.groups v on v.id = s.vendor_group_id
        where s.market_group_id = $1 and v.lifecycle_state = 'active' and v.dissolved_at is null and v.unclaimed_hidden_at is null
        order by s.confirmed_at is null, v.name`,
      [marketId],
    )
  ).rows

type StallRow = Omit<Row, 'post_id' | 'series_id' | 'body' | 'starts_on' | 'ends_on' | 'group_id'> & { every_week: boolean; dates: string[]; skip_dates: string[]; market_name: string }

/** #955 — "Remind me" on a vendor: the evening before each market day it is at, never on one it is skipping. */
async function runStallReminders(db: Db, now: Date, until: Date, push: NonNullable<Channels['push']>, email: NonNullable<Channels['email']>, site: string) {
  const rows = (
    await db.query<StallRow>(
      `select r.id as reminder_id, r.member_id, u.email, st.every_week, st.dates::text[] as dates, st.skip_dates::text[] as skip_dates,
              v.name, v.public_id, mk.name as market_name, ser.weekdays, p.starts_at, p.ends_at,
              pr.remind_evening, false as remind_hour, pr.paused, pr.quiet_start, pr.quiet_end
         from public.post_reminders r
         join public.members m on m.id = r.member_id and m.deleted_at is null
         left join auth.users u on u.id = r.member_id
         join public.market_stalls st on st.id = r.stall_id
         join public.groups v on v.id = st.vendor_group_id and v.lifecycle_state = 'active' and v.dissolved_at is null and v.unclaimed_hidden_at is null
         join public.groups mk on mk.id = st.market_group_id and mk.lifecycle_state = 'active' and mk.dissolved_at is null and mk.unclaimed_hidden_at is null
         join lateral (
           select pp.starts_at, pp.ends_at, pp.series_id from public.page_posts pp
            where pp.group_id = mk.id and pp.series_id is not null and pp.sample_kind is null and pp.lifecycle_state = 'active'
              and pp.dissolved_at is null and pp.hidden_at is null and pp.removed_at is null and pp.starts_at is not null
            order by pp.starts_at limit 1
         ) p on true
         join public.post_series ser on ser.id = p.series_id
         left join public.notification_prefs pr on pr.member_id = r.member_id
        where r.stall_id is not null`,
    )
  ).rows
  let due = 0, pushed = 0, emailed = 0, undelivered = 0
  for (const r of rows) {
    const prefs: ReminderPrefs = { remindEvening: r.remind_evening ?? true, remindHour: false, paused: r.paused ?? false, quietStart: r.quiet_start ?? 21, quietEnd: r.quiet_end ?? 8 }
    const first = { startsAt: new Date(r.starts_at), endsAt: r.ends_at ? new Date(r.ends_at) : null }
    for (const o of seriesOccurrences({ weekdays: r.weekdays ?? [], startsOn: null, endsOn: null }, first, now, until)) {
      if (!attends(r, metroDate(o.startsAt, METRO_TIME_ZONE))) continue
      const sent = new Set((await db.query<{ slot: Slot }>(`select slot from public.reminder_sends where reminder_id = $1 and occurs_at = $2`, [r.reminder_id, o.startsAt])).rows.map((x) => x.slot))
      const slot = dueSlot(o.startsAt, now, prefs, sent)
      if (!slot) continue
      due++
      const facts: ReminderFacts = { reminderId: r.reminder_id, pageName: r.name, pagePublicId: r.public_id, body: stallReminderBody(r.market_name, o.startsAt, o.endsAt), occursAt: o.startsAt, plain: true }
      const how = await deliver(db, r as unknown as Row, slot, facts, push, email, site)
      if (how === 'none') {
        undelivered++
        continue
      }
      if (how === 'push') pushed++
      else emailed++
      await db.query(`insert into public.reminder_sends (reminder_id, occurs_at, slot) values ($1, $2, $3) on conflict do nothing`, [r.reminder_id, o.startsAt, slot])
      await db.query(`select public.notification_count('reminder', 'sends', 1)`)
      if (how === 'email') await db.query(`select public.notification_count('reminder', 'emails', 1)`)
    }
  }
  return { due, pushed, emailed, undelivered }
}

async function deliver(
  db: Db,
  r: Row,
  slot: Slot,
  facts: ReminderFacts,
  push: NonNullable<Channels['push']>,
  email: NonNullable<Channels['email']>,
  site: string,
): Promise<'push' | 'email' | 'none'> {
  const subs = (await db.query<Subscription & { id: string }>(`select id, endpoint, p256dh, auth from public.push_subscriptions where member_id = $1`, [r.member_id])).rows
  let ok = false
  for (const s of subs) {
    const res = await push(s, reminderMessage(slot, facts))
    if (res === 'gone') await db.query(`delete from public.push_subscriptions where id = $1`, [s.id])
    if (res === 'ok') ok = true
  }
  if (ok) return 'push'
  if (!r.email) return 'none'
  const e = reminderEmail(slot, facts, site)
  return (await email(r.email, e.subject, e.text, `${site.replace(/\/$/, '')}${reminderUrl(facts)}`)) ? 'email' : 'none'
}
