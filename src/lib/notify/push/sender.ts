// #904 — the sender. Runs from the notify workflow as the service role (scripts/notify/run.ts).
//   follow   reads followed Pages' new real posts into the queue, then sends each member one batched notification
//            when their choices, quiet hours, the daily cap and the gap allow.
//   weekend  Thursday evening: what's on this weekend from followed Pages and the member's interests in their area.
//   stats    the weekly counts and the opt-in snapshot, for the dashboard and the monthly review.

import type { Client, PoolClient } from 'pg'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'
import { normalizeTag } from '@/lib/groups/tags'
import { METRO_TIME_ZONE } from '@/lib/metro/metro-time'
import { localDay, mayReceive, planFollowSend, weekendMessage, weekendWindow, type Prefs, type PushMessage, type QueuedPost } from './rules'
import { sendPush, type SendResult, type Subscription } from './send'
import type { WeekRow } from './review'

type Db = Pick<Client | PoolClient, 'query'>
type Push = (sub: Subscription, m: PushMessage) => Promise<SendResult>

type PrefRow = { follow_posts: boolean; weekend: boolean; paused: boolean; quiet_start: number; quiet_end: number }
const prefsOf = (r: PrefRow): Prefs => ({ followPosts: r.follow_posts, weekend: r.weekend, paused: r.paused, quietStart: r.quiet_start, quietEnd: r.quiet_end })


// A real, visible post on a live Page (samples never notify anyone) is spelled out in each query below,
// because SQL here is never assembled from pieces (T051).

/** Fan-out: every new live post since the cursor, to each opted-in follower (not the people who manage the Page). */
export async function enqueueNewPosts(db: Db, now: Date): Promise<number> {
  const res = await db.query(
    `with cur as (select read_to from public.notification_cursor where id = 1)
     insert into public.notification_queue (member_id, post_id, queued_at)
     select gm.member_id, p.id, $1
       from public.page_posts p
       join public.groups g on g.id = p.group_id
       join cur on p.created_at > cur.read_to and p.created_at <= $1
       join public.group_memberships gm on gm.group_id = g.id and gm.left_at is null and gm.role = 'member'
       join public.notification_prefs pr on pr.member_id = gm.member_id and pr.follow_posts
       join public.members m on m.id = gm.member_id and m.deleted_at is null
      where p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null and p.hidden_at is null and p.removed_at is null
  and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
        and (not public.is_builder(g.founder_member_id) or public.is_builder(gm.member_id))
        and exists (select 1 from public.push_subscriptions s where s.member_id = gm.member_id)
     on conflict do nothing`,
    [now],
  )
  await db.query(`update public.notification_cursor set read_to = $1 where id = 1`, [now])
  return res.rowCount ?? 0
}

async function deliver(db: Db, memberId: string, m: PushMessage, push: Push): Promise<boolean> {
  const subs = (await db.query<Subscription & { id: string }>(`select id, endpoint, p256dh, auth from public.push_subscriptions where member_id = $1`, [memberId])).rows
  let delivered = false
  for (const s of subs) {
    const r = await push(s, m)
    if (r === 'gone') await db.query(`delete from public.push_subscriptions where id = $1`, [s.id])
    if (r === 'ok') delivered = true
  }
  if (delivered) {
    await db.query(`insert into public.notification_sends (member_id, kind, sent_at) values ($1, $2, now())`, [memberId, m.kind])
    await db.query(`select public.notification_count($1, 'sends', 1)`, [m.kind])
  }
  return delivered
}

/** Local midnight today, as an instant, for the daily cap. */
function startOfLocalDay(now: Date): Date {
  const day = localDay(now)
  for (const off of ['-07:00', '-08:00']) {
    const d = new Date(`${day}T00:00:00${off}`)
    if (localDay(d) === day && localDay(new Date(d.getTime() - 1)) !== day) return d
  }
  return new Date(`${day}T00:00:00-08:00`)
}

export interface FollowRun {
  queued: number
  sent: number
  held: number
  dropped: number
}

export async function runFollow(db: Db, now: Date, push: Push = (s, m) => sendPush(s, m)): Promise<FollowRun> {
  const queued = await enqueueNewPosts(db, now)
  // A post taken down, or a member who turned this off or lost every subscription, leaves the queue.
  const cleared = await db.query(
    `delete from public.notification_queue q
      using public.page_posts p, public.groups g
      where p.id = q.post_id and g.id = p.group_id
        and (not (p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null and p.hidden_at is null and p.removed_at is null
  and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null)
             or not exists (select 1 from public.notification_prefs pr where pr.member_id = q.member_id and pr.follow_posts)
             or not exists (select 1 from public.push_subscriptions s where s.member_id = q.member_id))`,
  )
  const rows = (
    await db.query<{ member_id: string; post_id: string; queued_at: Date; body: string; name: string; public_id: string } & PrefRow>(
      `select q.member_id, q.post_id, q.queued_at, p.body, g.name, g.public_id,
              pr.follow_posts, pr.weekend, pr.paused, pr.quiet_start, pr.quiet_end
         from public.notification_queue q
         join public.page_posts p on p.id = q.post_id
         join public.groups g on g.id = p.group_id
         join public.notification_prefs pr on pr.member_id = q.member_id
        order by q.member_id, q.queued_at`,
    )
  ).rows
  const byMember = new Map<string, { prefs: Prefs; posts: QueuedPost[] }>()
  for (const r of rows) {
    const e = byMember.get(r.member_id) ?? { prefs: prefsOf(r), posts: [] }
    e.posts.push({ postId: r.post_id, pageName: r.name, pagePublicId: r.public_id, body: r.body, queuedAt: new Date(r.queued_at) })
    byMember.set(r.member_id, e)
  }
  const dayStart = startOfLocalDay(now)
  let sent = 0, held = 0, dropped = cleared.rowCount ?? 0
  for (const [memberId, { prefs, posts }] of byMember) {
    const s = (
      await db.query<{ today: number; last: Date | null }>(
        `select count(*) filter (where sent_at >= $2)::int as today, max(sent_at) as last
           from public.notification_sends where member_id = $1 and kind = 'follow_posts'`,
        [memberId, dayStart],
      )
    ).rows[0]!
    const plan = planFollowSend(prefs, posts, s.today, s.last ? new Date(s.last) : null, now)
    const done = [...plan.drop]
    dropped += plan.drop.length
    if ('send' in plan) {
      const fresh = posts.filter((p) => !plan.drop.includes(p.postId)).map((p) => p.postId)
      if (await deliver(db, memberId, plan.send, push)) {
        sent++
        done.push(...fresh)
      } else held++
    } else held++
    if (done.length) await db.query(`delete from public.notification_queue where member_id = $1 and post_id = any($2::uuid[])`, [memberId, done])
  }
  // Rate-limit rows past the cap's reach are not kept.
  await db.query(`delete from public.notification_sends where sent_at < $1::timestamptz - interval '30 days'`, [now])
  return { queued, sent, held, dropped }
}

/** The interest tags a member chose, as the Page and post tags they match (#892's mapping). */
export function interestTagsFor(chosen: readonly string[]): string[] {
  const label = new Map(INTEREST_VOCAB.map((v) => [v.tag, v.label]))
  return [...new Set(chosen.map((t) => normalizeTag(label.get(t) ?? t.replace(/-/g, ' '))))]
}

export async function weekendCounts(db: Db, memberId: string, now: Date): Promise<{ total: number; followed: number }> {
  const { from, to } = weekendWindow(now, METRO_TIME_ZONE)
  const chosen = (await db.query<{ tag: string }>(`select tag from public.member_interests where member_id = $1`, [memberId])).rows.map((r) => r.tag)
  const tags = interestTagsFor(chosen)
  const r = (
    await db.query<{ total: number; followed: number }>(
      `with me as (
         select m.id, mp.geography as area
           from public.members m
           left join public.metro_polygons mp on mp.id = coalesce(m.default_metro_id, m.home_metro_id)
          where m.id = $1
       ), hits as (
         select exists (select 1 from public.group_memberships gm where gm.group_id = g.id and gm.member_id = me.id and gm.left_at is null) as followed,
                p.discoverability = 'listed' and g.discoverability = 'listed'
                  and me.area is not null and st_intersects(coalesce(pl.geography, gl.geography), me.area)
                  and (exists (select 1 from public.page_tags pt join public.tags t on t.id = pt.tag_id and t.status = 'visible'
                                where pt.group_id = g.id and t.normalized = any($4))
                       or exists (select 1 from public.post_tags pt join public.tags t on t.id = pt.tag_id and t.status = 'visible'
                                   where pt.post_id = p.id and t.normalized = any($4))) as liked
           from me
           cross join public.page_posts p
           join public.groups g on g.id = p.group_id
           left join public.locations pl on pl.id = p.location_id and pl.deleted_at is null
           left join public.locations gl on gl.id = g.anchor_location_id and gl.deleted_at is null
          where p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null and p.hidden_at is null and p.removed_at is null
  and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
            and p.starts_at < $3 and coalesce(p.ends_at, p.starts_at) >= $2
            and (not public.is_builder(g.founder_member_id) or public.is_builder(me.id))
       )
       select count(*) filter (where followed or liked)::int as total, count(*) filter (where followed)::int as followed from hits`,
      [memberId, from, to, tags],
    )
  ).rows[0]!
  return r
}

export async function runWeekend(db: Db, now: Date, push: Push = (s, m) => sendPush(s, m)): Promise<{ members: number; sent: number; nothingOn: number; later: number }> {
  const members = (
    await db.query<{ member_id: string } & PrefRow>(
      `select pr.member_id, pr.follow_posts, pr.weekend, pr.paused, pr.quiet_start, pr.quiet_end
         from public.notification_prefs pr
         join public.members m on m.id = pr.member_id and m.deleted_at is null
        where pr.weekend and not pr.paused
          and exists (select 1 from public.push_subscriptions s where s.member_id = pr.member_id)
          and not exists (select 1 from public.notification_sends ns where ns.member_id = pr.member_id and ns.kind = 'weekend'
                           and ns.sent_at > $1::timestamptz - interval '6 days')`,
      [now],
    )
  ).rows
  let sent = 0, nothingOn = 0, later = 0
  for (const m of members) {
    if (!mayReceive(prefsOf(m), 'weekend', now)) {
      later++
      continue
    }
    const c = await weekendCounts(db, m.member_id, now)
    const msg = weekendMessage(c.total, c.followed)
    if (!msg) {
      nothingOn++
      continue
    }
    if (await deliver(db, m.member_id, msg, push)) sent++
  }
  return { members: members.length, sent, nothingOn, later }
}

/** Snapshot the opt-in rate into this week's rows, then return the last `weeks` weeks of counts. */
export async function stats(db: Db, weeks = 12): Promise<WeekRow[]> {
  await db.query(
    `with wk as (select date_trunc('week', now() at time zone 'America/Los_Angeles')::date as w),
          real_members as (select m.id from public.members m where m.deleted_at is null and not public.is_builder(m.id)),
          reachable as (select pr.* from public.notification_prefs pr join real_members rm on rm.id = pr.member_id
                         where not pr.paused and exists (select 1 from public.push_subscriptions s where s.member_id = pr.member_id))
     insert into public.notification_weekly (week_start, kind, opted_in_members, members)
     select wk.w, k.kind,
            (select count(*) from reachable r where case k.kind when 'follow_posts' then r.follow_posts else r.weekend end),
            (select count(*) from real_members)
       from wk cross join (values ('follow_posts'), ('weekend')) as k(kind)
     on conflict (week_start, kind) do update set opted_in_members = excluded.opted_in_members, members = excluded.members`,
  )
  return (
    await db.query<WeekRow>(
      `select to_char(week_start, 'YYYY-MM-DD') as week, kind, sends, opens, opt_ins, unsubscribes, mutes, opted_in_members, members
         from public.notification_weekly
        where week_start > (now() at time zone 'America/Los_Angeles')::date - ($1::int * 7)
        order by week_start, kind`,
      [weeks],
    )
  ).rows
}
