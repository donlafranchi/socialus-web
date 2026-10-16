-- #791 — Explore's three "happening" rows in one call.
--
-- They were three browse_feed calls (today, this week, this weekend), each with
-- its own round trip and all three contending with the main feed. Today and
-- this week start at the same moment, so today is the front of the week list
-- (the app cuts it at tonight); only the weekend, which starts later, needs its
-- own pass. Each bucket is browse_feed itself, so visibility, scope, the
-- drop-out of past posts and the soonest-first order are its, unchanged, and
-- each bucket keeps its own limit (more than the limit of posts can land before
-- the weekend, which one capped read would cut).
--
-- Posts only. Signed out it returns nothing: browse_feed gives no posts without
-- a member (F093; the app reads the withheld path instead). Granted to anon like
-- browse_feed rather than revoked, so a signed-out call is an empty answer.

create or replace function public.browse_happening(
  p_metro_id     uuid,
  p_place_id     uuid,
  p_from         timestamptz,
  p_weekend_from timestamptz,
  p_before       timestamptz,
  p_limit        int default 20
)
returns table (
  bucket             text,
  result_kind        text,
  result_id          uuid,
  group_id           uuid,
  group_kind         text,
  slug               text,
  name               text,
  place_path         text,
  photo_url          text,
  photo_hidden_at    timestamptz,
  photo_removed_at   timestamptz,
  photo_source       text,
  description        text,
  body               text,
  tags               text[],
  starts_at          timestamptz,
  location_id        uuid,
  location_label     text,
  location_geography geography,
  page_created_at    timestamptz,
  updated_at         timestamptz,
  sort_at            timestamptz,
  posted_at          timestamptz,
  ends_at            timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select 'week'::text, f.*
    from public.browse_feed(
      p_metro_id => p_metro_id, p_place_id => p_place_id, p_result_kinds => array['post'],
      p_starts_from => p_from, p_starts_before => p_before, p_sort => 'soonest', p_limit => p_limit) f
  union all
  select 'weekend'::text, f.*
    from public.browse_feed(
      p_metro_id => p_metro_id, p_place_id => p_place_id, p_result_kinds => array['post'],
      p_starts_from => p_weekend_from, p_starts_before => p_before, p_sort => 'soonest', p_limit => p_limit) f
$$;

comment on function public.browse_happening(uuid, uuid, timestamptz, timestamptz, timestamptz, int) is
  'Explore''s happening rows (F091) in one call (#791): browse_feed''s posts, soonest first, for this week (bucket ''week'', from p_from) and this weekend (bucket ''weekend'', from p_weekend_from), both before p_before, each with its own p_limit. Today is the week bucket cut at tonight, in the app. Visibility is browse_feed''s.';

revoke all on function public.browse_happening(uuid, uuid, timestamptz, timestamptz, timestamptz, int) from public;
grant execute on function public.browse_happening(uuid, uuid, timestamptz, timestamptz, timestamptz, int) to anon, authenticated;
