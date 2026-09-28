-- F093 (#215), amended 2026-09-27 — one withheld card per Page, with its photo.
--
-- Don, on production: the signed-out card "looks weird". Two things made it so:
--   * one card per ANNOUNCEMENT, each carrying the PAGE's count, so a Page with
--     two posts rendered two identical cards both reading "1 announcement this
--     week" — correct per row and broken to a reader;
--   * no image, so the card sat in a grid of photo tiles as a bare text box.
--
-- So the projection now returns one row per Page, and gains the Page photo.
-- The photo is public already (Pages are fully public, F093 criterion 8), and
-- is resolved HERE — hidden or removed comes back null — so a moderated photo
-- never reaches the browser to be declined by a component.
--
-- WHAT DID NOT MOVE, AND MUST NOT: no body, no starts_at, no location in the
-- return type. `announcement_ids` carries ids only, so any
-- `#announcement-<id>` link a stranger follows resolves to this Page's card
-- (criterion 9). Ids were already projected one per row; this discloses
-- nothing the row count did not.

drop function if exists public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int);

create function public.announcements_withheld(
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
  updated_at         timestamptz
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
         or pp.starts_at is null
         or pp.starts_at >= coalesce(p_now, now())
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
    g.name,
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
    p.updated_at
  from per_page p
  join public.groups g on g.id = p.group_id
  order by p.updated_at desc, g.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) is
  'F093 — the signed-out read path for announcements, one row per Page. Returns which Page posted, its visible photo, how many announcements it has in the given period, and the ids its card answers to — and nothing about what was posted: no body, no starts_at, no location in the return type. security definer on purpose; the projection is the guarantee. Count is over created_at, never starts_at.';

revoke all on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) from public;
grant execute on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) to anon, authenticated;
