-- #335 — the signed-out withheld card shows the Page kind's default art (F093.4, F070.4, 2026-10-01: a Page with
-- no photo shows its kind's art). `announcements_withheld` gains `kind`. The kind is already public on the front
-- door's art, so the card learns nothing new about what was posted, when or where.
--
-- Adding a column to RETURNS TABLE changes the return type, so the function is dropped and recreated with the
-- same body (20261018170000_undated_posts_expire's definition) and the same grants.

drop function if exists public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int);

create or replace function public.announcements_withheld(
  p_metro_id     uuid        default null,
  p_place_id     uuid        default null,
  p_group_id     uuid        default null,
  p_period_from  timestamptz default null,
  p_period_to    timestamptz default null,
  p_now          timestamptz default null,
  p_limit        int         default 50
)
returns table (
  -- One row per Page. Which Page, its photo, how many this period, and the
  -- ids its card answers to. Nothing about what was posted, when, or where.
  result_id          uuid,
  group_id           uuid,
  slug               text,
  name               text,
  public_id          text,
  photo_url          text,
  announcement_count int,
  announcement_ids   uuid[],
  updated_at         timestamptz,
  kind               text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scope as (
    select mp.geography
      from public.metro_polygons mp
     where p_metro_id is not null and mp.id = p_metro_id
    union all
    select pl.geography
      from public.places pl
     where p_place_id is not null
       and pl.id = p_place_id
       and pl.deleted_at is null
  ),
  visible as (
    -- Unchanged from 20260923161500: every clause RLS would have applied,
    -- restated because security definer means RLS is not applying them.
    select pp.id, pp.group_id, pp.updated_at
      from public.page_posts pp
      join public.groups g
        on g.id = pp.group_id
      left join public.locations pl
        on pl.id = pp.location_id
       and pl.deleted_at is null
      left join public.locations gl
        on gl.id = g.anchor_location_id
       and gl.deleted_at is null
     where pp.lifecycle_state = 'active'
       and pp.discoverability = 'listed'
       and pp.dissolved_at is null
       and g.lifecycle_state = 'active'
       and g.discoverability = 'listed'
       and g.dissolved_at is null
       and public.builder_visible(g.founder_member_id)
       and (
         (p_group_id is not null and g.id = p_group_id)
         or (
           p_group_id is null
           and exists (
             select 1 from scope s
              where st_intersects(coalesce(pl.geography, gl.geography), s.geography)
           )
         )
       )
       and (
         p_group_id is not null
         or public.post_current_until(pp.created_at, pp.starts_at, pp.ends_at, pp.show_until) >= coalesce(p_now, now())
       )
  ),
  per_page as (
    select
      v.group_id,
      (array_agg(v.id order by v.updated_at desc, v.id))[1] as result_id,
      array_agg(v.id order by v.updated_at desc, v.id)      as announcement_ids,
      max(v.updated_at)                                     as updated_at
    from visible v
    group by v.group_id
  )
  select
    p.result_id,
    g.id,
    g.slug,
    case when g.words_hidden_at is null and g.words_removed_at is null then g.name else 'Hidden while we look' end as name,
    g.public_id,
    case
      when g.photo_hidden_at is null and g.photo_removed_at is null then g.photo_url
    end,
    -- Over created_at and NEVER starts_at: a count by start time lets a caller
    -- sweep the bounds and rebuild when things happen.
    (
      select count(*)::int
        from public.page_posts c
       where c.group_id = g.id
         and c.lifecycle_state = 'active'
         and c.discoverability = 'listed'
         and c.dissolved_at is null
         and (p_period_from is null or c.created_at >= p_period_from)
         and (p_period_to   is null or c.created_at <  p_period_to)
    ),
    p.announcement_ids,
    p.updated_at,
    g.kind
  from per_page p
  join public.groups g on g.id = p.group_id
  order by p.updated_at desc, g.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) from public;
grant execute on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) to anon, authenticated;
