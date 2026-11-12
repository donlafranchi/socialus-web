// F133 — usage.log
//
// One use of a part of the app, or one step reached, counted with no member id: who comes back (active members per
// week by join week), what they use (members per part per day) and where they drop off (sign-up steps, first follow,
// first post per week). A member who turned sharing off on You (search_sharing) and every builder are never counted.
// A member counts once per part per day, once per week, and once per step, by sha256 keys in usage_seen; keys are
// deleted after 8 days, here, on every write. A first follow or first post is read from the member's own rows, so
// it needs no long-lived key.
//
// One statement, one round trip, no transaction: callers run it after the response (countUse), so a page never waits
// on it and it holds a pooled connection for one query only.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { getPool } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const USAGE_PARTS = ['posts', 'explore', 'pages', 'groups', 'map', 'search', 'ask'] as const
export const FUNNEL_STEPS = ['signed_in', 'profile', 'welcomed', 'first_follow', 'first_post'] as const
export type UsagePart = (typeof USAGE_PARTS)[number]
export type FunnelStep = (typeof FUNNEL_STEPS)[number]

export const usageLogInput = z
  .object({ part: z.enum(USAGE_PARTS).optional(), step: z.enum(FUNNEL_STEPS).optional() })
  .strict()
  .refine((v) => Boolean(v.part) !== Boolean(v.step), { message: 'one of part or step' })
export type UsageLogInput = z.infer<typeof usageLogInput>

// $1 member (uuid), $2 part (text or null), $3 step (text or null). The member id is used only to look the member up
// and inside sha256(); it is never written. Weeks start Monday, days are Pacific (the metro's).
export const USAGE_LOG_SQL = `
with cal as (
  select coalesce(m.search_sharing, false) and not public.is_builder(m.id) as ok,
         date_trunc('week', m.created_at at time zone 'America/Los_Angeles')::date as join_week,
         (now() at time zone 'America/Los_Angeles')::date as day,
         date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date as week
    from public.members m
   where m.id = $1::uuid
),
first_ok as (
  select case $3::text
    when 'first_follow' then
      (select count(*) from public.member_follows f where f.follower_member_id = $1::uuid)
      + (select count(*) from public.group_memberships g where g.member_id = $1::uuid and g.role not in ('owner', 'steward')) = 1
      and not exists (select 1 from public.member_follows f where f.follower_member_id = $1::uuid and f.created_at < now() - interval '7 days')
      and not exists (select 1 from public.group_memberships g where g.member_id = $1::uuid and g.role not in ('owner', 'steward') and g.joined_at < now() - interval '7 days')
    when 'first_post' then
      (select count(*) from public.member_posts p where p.member_id = $1::uuid)
      + (select count(*) from public.group_events e
          where e.event_kind = 'group.post_created' and e.acting_member_id = $1::uuid
            and e.group_id in (select g.group_id from public.group_memberships g where g.member_id = $1::uuid and g.role in ('owner', 'steward'))) = 1
      and not exists (select 1 from public.member_posts p where p.member_id = $1::uuid and p.created_at < now() - interval '7 days')
    else true
  end as ok
),
who as (select cal.* from cal, first_ok where cal.ok and first_ok.ok),
purge as (delete from public.usage_seen where seen_on < current_date - 8),
keys (kind, key) as (
  select 'week', encode(sha256(convert_to('usage-week|' || $1::uuid::text || '|' || who.week::text, 'UTF8')), 'hex') from who
  union all
  select 'part', encode(sha256(convert_to('usage-part|' || $1::uuid::text || '|' || $2::text || '|' || who.day::text, 'UTF8')), 'hex') from who where $2::text is not null
  union all
  select 'step', encode(sha256(convert_to('usage-step|' || $1::uuid::text || '|' || $3::text, 'UTF8')), 'hex') from who where $3::text is not null
),
fresh as (
  insert into public.usage_seen (key) select key from keys on conflict (key) do nothing returning key
),
fresh_kinds as (select k.kind from fresh join keys k using (key)),
w as (
  insert into public.usage_weekly (week, join_week, active)
  select who.week, who.join_week, 1 from who where exists (select 1 from fresh_kinds where kind = 'week')
  on conflict (week, join_week) do update set active = public.usage_weekly.active + 1
  returning 1
),
d as (
  insert into public.usage_daily (day, part, members)
  select who.day, $2::text, 1 from who where exists (select 1 from fresh_kinds where kind = 'part')
  on conflict (day, part) do update set members = public.usage_daily.members + 1
  returning 1
),
f as (
  insert into public.funnel_weekly (week, step, reached)
  select who.week, $3::text, 1 from who where exists (select 1 from fresh_kinds where kind = 'step')
  on conflict (week, step) do update set reached = public.funnel_weekly.reached + 1
  returning 1
)
select (select count(*) from who)::int as counted,
       (select count(*) from w)::int + (select count(*) from d)::int + (select count(*) from f)::int as written`

export const usageLog = defineHandler(
  'usage.log',
  usageLogInput,
  async (ctx: ActionContext, input: UsageLogInput): Promise<{ counted: boolean }> => {
    const memberId = ctx.actingMemberId
    if (!memberId || memberId === 'self-bootstrap') return { counted: false }
    const res = await getPool().query<{ counted: number; written: number }>(USAGE_LOG_SQL, [memberId, input.part ?? null, input.step ?? null])
    return { counted: (res.rows[0]?.written ?? 0) > 0 }
  },
)
