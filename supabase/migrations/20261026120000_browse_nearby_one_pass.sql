-- #1080 (from #978) — Explore's default read ran browse_feed once per 15-minute ring and then ran the chosen
-- ring again for the answer, each run recomputing explore_vantage. The ring that satisfied the target is the
-- answer (same call, same limit of 100), so it is kept from the loop instead of being asked for twice: one
-- browse_feed run fewer on every Explore open. Same rows, same order, same reach; only p_minutes (the member
-- asked for a reach) still makes its single call.

create or replace function public.browse_nearby(
  p_metro_id     uuid,
  p_result_kinds text[]      default null,
  p_week_end     timestamptz default null,
  p_minutes      int         default null,
  p_target       int         default 24,
  p_cap_minutes  int         default 60,
  p_limit        int         default 100
)
returns table (
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
  ends_at            timestamptz,
  sample_kind        text,
  reach_minutes      int,
  reach_from         text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_minutes int;
  v_ring    int;
  v_count   int;
  v_from    text;
  v_rows    jsonb := null;
begin
  if p_minutes is not null then
    v_minutes := greatest(1, p_minutes);
  else
    for v_ring in select generate_series(15, greatest(15, p_cap_minutes), 15) loop
      v_minutes := v_ring;
      -- The ring's rows are kept in browse_feed's own order, so the last ring tried is the answer.
      select count(*) filter (where f.result_kind = 'page' or f.starts_at is null or p_week_end is null or f.starts_at < p_week_end),
             coalesce(jsonb_agg(to_jsonb(f) order by f.ord), '[]'::jsonb)
        into v_count, v_rows
        from (select g.*, row_number() over () as ord
                from public.browse_feed(p_metro_id => p_metro_id, p_result_kinds => p_result_kinds,
                                        p_reach_m => v_ring * 1000.0, p_limit => 100) g) f;
      exit when v_count >= p_target;
    end loop;
  end if;
  select v.from_name into v_from from public.explore_vantage(p_metro_id) v;
  if v_rows is null then
    return query
      select f.*, v_minutes, v_from
        from public.browse_feed(p_metro_id => p_metro_id, p_result_kinds => p_result_kinds,
                                p_reach_m => v_minutes * 1000.0, p_limit => p_limit) f;
  else
    return query
      select x.result_kind, x.result_id, x.group_id, x.group_kind, x.slug, x.name, x.place_path, x.photo_url,
             x.photo_hidden_at, x.photo_removed_at, x.photo_source, x.description, x.body, x.tags, x.starts_at,
             x.location_id, x.location_label, x.location_geography, x.page_created_at, x.updated_at, x.sort_at,
             x.posted_at, x.ends_at, x.sample_kind, v_minutes, v_from
        from jsonb_to_recordset(v_rows) as x(
               result_kind text, result_id uuid, group_id uuid, group_kind text, slug text, name text, place_path text,
               photo_url text, photo_hidden_at timestamptz, photo_removed_at timestamptz, photo_source text,
               description text, body text, tags text[], starts_at timestamptz, location_id uuid, location_label text,
               location_geography geography, page_created_at timestamptz, updated_at timestamptz, sort_at timestamptz,
               posted_at timestamptz, ends_at timestamptz, sample_kind text, ord bigint)
       where x.ord <= greatest(1, least(coalesce(p_limit, 50), 100))
       order by x.ord;
  end if;
end
$$;
