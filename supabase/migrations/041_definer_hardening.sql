-- Issue #36 — Supabase security advisor hardening: pin search_path, revoke
-- default anon EXECUTE on trigger-only SECURITY DEFINER functions.
-- Source: Supabase security advisor against socialus-db, 2026-09-09.
--
-- Two independent changes, neither of which alters behaviour.
--
-- 1. FOURTEEN FUNCTIONS SHIP WITHOUT A PINNED search_path. Every one is ours
--    and every one is re-created below with the identical body plus a `set
--    search_path`. Without the pin, whatever search_path the caller happens to
--    hold decides how an unqualified function, operator or type inside the body
--    resolves — so a caller who can create objects in a schema earlier on their
--    own path can shadow what the body meant to call. The bodies here already
--    schema-qualify their table references; the pin closes the operator and
--    built-in resolution that qualification cannot reach.
--
--    `public, pg_catalog` is the default pin. The one PostGIS caller
--    (resolve_home_metro) takes `public, extensions` to match the existing
--    convention in 027/032/033, since 001 installs postgis unqualified but
--    Supabase-managed environments may hold it in `extensions`.
--
-- 2. FIVE SECURITY DEFINER FUNCTIONS ARE EXECUTABLE BY anon. Not because
--    anything granted them — because Postgres grants EXECUTE to PUBLIC by
--    default at creation, and only 028_email_is_registered.sql ever revoked it.
--    All five are trigger bodies with no `.rpc()` caller anywhere in src/.
--    PostgreSQL checks EXECUTE on a trigger function when the trigger is
--    CREATED, not when it fires, so revoking is invisible to the triggers.
--
--    handle_new_auth_user() is re-revoked even though 006 already revoked it in
--    migration — the advisor still reports it against the live database, which
--    means either drift or a grant applied outside migrations. REVOKE is
--    idempotent; re-asserting costs nothing and closes the gap either way.
--
-- DELIBERATELY NOT TOUCHED (full reasoning in issue #36):
--   - The four member_public_* views. Load-bearing privacy projections; the
--     owner-privileges bypass IS the mechanism, per 029/030/038.
--   - The 22 partitions + embedding tables with RLS and no policy. The
--     intended deny-all end state of 035_partition_rls.sql.
--   - spatial_ref_sys + the st_estimatedextent overloads. PostGIS-owned.
--   - current_member_explicit_group_ids(). Called inside four RLS policy USING
--     clauses (014, 015); policy expressions run with the querying role's
--     privileges, so revoking turns member reads into permission errors.
--   - zip_is_proximal_to_location, resolve_member_page_visibility. Live
--     PostgREST callers; migrations-t075.test.ts asserts the former's grant.
--   - place_for_coords. Reached only through the action layer's direct pg pool
--     as postgres, so its PUBLIC grant is unused rather than exposed.
--   - discoverable_items anon SELECT. By design — a materialized view cannot
--     carry RLS, so its WHERE clause is the gate (016).
--   - vector / postgis / pg_net in public. Real finding, breaking remedy.
--   - Leaked password protection. A dashboard auth setting, not a migration.

------------------------------------------------------------
-- 1. Pin search_path — trigger functions.
------------------------------------------------------------

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.groups_default_discoverability()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if NEW.discoverability is null then
    NEW.discoverability := case NEW.kind when 'family' then 'private' else 'listed' end;
  end if;
  return NEW;
end;
$$;

create or replace function public.places_set_ancestor_state_id()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  cur_id     uuid := NEW.parent_id;
  cur_kind   text;
  cur_parent uuid;
begin
  -- A state row has no state ancestor.
  if NEW.kind = 'state' then
    NEW.ancestor_state_id := NULL;
    return NEW;
  end if;

  for i in 1..5 loop
    if cur_id is null then
      NEW.ancestor_state_id := NULL;
      return NEW;
    end if;
    select kind, parent_id into cur_kind, cur_parent
      from public.places where id = cur_id;
    if not found then
      NEW.ancestor_state_id := NULL;
      return NEW;
    end if;
    if cur_kind = 'state' then
      NEW.ancestor_state_id := cur_id;
      return NEW;
    end if;
    cur_id := cur_parent;
  end loop;

  -- Walk exhausted without finding a state. NULL is the honest answer;
  -- the city-must-have-state CHECK will reject city rows in this state.
  NEW.ancestor_state_id := NULL;
  return NEW;
end;
$$;

------------------------------------------------------------
-- 2. Pin search_path — resolver.
------------------------------------------------------------
-- PostGIS caller (ST_Contains / ST_Area): `public, extensions`, matching the
-- convention already used by locality_feed_items / venue_* in 027/032/033.
-- Grant is unchanged — 031 grants this to authenticated, anon and the feed
-- vantage-point path calls it.

create or replace function public.resolve_home_metro(point geography)
returns uuid
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select id
  from public.metro_polygons
  where point is not null
    and ST_Contains(geography::geometry, point::geometry)
  order by ST_Area(geography) asc
  limit 1;
$$;

------------------------------------------------------------
-- 3. Pin search_path — the five partition-creation helpers.
------------------------------------------------------------
-- Bodies carried forward verbatim from 035_partition_rls.sql, including the
-- load-bearing `enable row level security` step. A partition does not inherit
-- the parent's rowsecurity flag, and PostgREST exposes each partition as its
-- own endpoint — dropping that line here would silently reopen the hole 035
-- closed on the next monthly rotation.

create or replace function public.ensure_member_events_partition(target_month date)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  partition_name text;
  range_start    date;
  range_end      date;
begin
  range_start    := date_trunc('month', target_month)::date;
  range_end      := (range_start + interval '1 month')::date;
  partition_name := format('member_events_y%sm%s',
                           to_char(range_start, 'YYYY'),
                           to_char(range_start, 'MM'));

  execute format(
    'create table if not exists public.%I partition of public.member_events
       for values from (%L) to (%L)',
    partition_name, range_start, range_end
  );

  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

create or replace function public.ensure_location_events_partition(target_month date)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  partition_name text;
  range_start    date;
  range_end      date;
begin
  range_start    := date_trunc('month', target_month)::date;
  range_end      := (range_start + interval '1 month')::date;
  partition_name := format('location_events_y%sm%s',
                           to_char(range_start, 'YYYY'),
                           to_char(range_start, 'MM'));

  execute format(
    'create table if not exists public.%I partition of public.location_events
       for values from (%L) to (%L)',
    partition_name, range_start, range_end
  );

  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

create or replace function public.ensure_group_events_partition(target_month date)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  partition_name text;
  range_start    date;
  range_end      date;
begin
  range_start    := date_trunc('month', target_month)::date;
  range_end      := (range_start + interval '1 month')::date;
  partition_name := format('group_events_y%sm%s',
                           to_char(range_start, 'YYYY'),
                           to_char(range_start, 'MM'));

  execute format(
    'create table if not exists public.%I partition of public.group_events
       for values from (%L) to (%L)',
    partition_name, range_start, range_end
  );

  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

create or replace function public.ensure_item_events_partition(target_month date)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  partition_name text;
  range_start    date;
  range_end      date;
begin
  range_start    := date_trunc('month', target_month)::date;
  range_end      := (range_start + interval '1 month')::date;
  partition_name := format('item_events_y%sm%s',
                           to_char(range_start, 'YYYY'),
                           to_char(range_start, 'MM'));

  execute format(
    'create table if not exists public.%I partition of public.item_events
       for values from (%L) to (%L)',
    partition_name, range_start, range_end
  );

  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

create or replace function public.ensure_place_events_partition(target_month date)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  partition_name text;
  range_start    date;
  range_end      date;
begin
  range_start    := date_trunc('month', target_month)::date;
  range_end      := (range_start + interval '1 month')::date;
  partition_name := format('place_events_y%sm%s',
                           to_char(range_start, 'YYYY'),
                           to_char(range_start, 'MM'));

  execute format(
    'create table if not exists public.%I partition of public.place_events
       for values from (%L) to (%L)',
    partition_name, range_start, range_end
  );

  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

------------------------------------------------------------
-- 4. Pin search_path — the five rotation wrappers.
------------------------------------------------------------

create or replace function public.rotate_member_events_partitions()
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base date := date_trunc('month', now())::date;
begin
  perform public.ensure_member_events_partition(base);
  perform public.ensure_member_events_partition((base + interval '1 month')::date);
  perform public.ensure_member_events_partition((base + interval '2 months')::date);
end;
$$;

create or replace function public.rotate_location_events_partitions()
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base date := date_trunc('month', now())::date;
begin
  perform public.ensure_location_events_partition(base);
  perform public.ensure_location_events_partition((base + interval '1 month')::date);
  perform public.ensure_location_events_partition((base + interval '2 months')::date);
end;
$$;

create or replace function public.rotate_group_events_partitions()
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base date := date_trunc('month', now())::date;
begin
  perform public.ensure_group_events_partition(base);
  perform public.ensure_group_events_partition((base + interval '1 month')::date);
  perform public.ensure_group_events_partition((base + interval '2 months')::date);
end;
$$;

create or replace function public.rotate_item_events_partitions()
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base date := date_trunc('month', now())::date;
begin
  perform public.ensure_item_events_partition(base);
  perform public.ensure_item_events_partition((base + interval '1 month')::date);
  perform public.ensure_item_events_partition((base + interval '2 months')::date);
end;
$$;

create or replace function public.rotate_place_events_partitions()
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base date := date_trunc('month', now())::date;
begin
  perform public.ensure_place_events_partition(base);
  perform public.ensure_place_events_partition((base + interval '1 month')::date);
  perform public.ensure_place_events_partition((base + interval '2 months')::date);
end;
$$;

------------------------------------------------------------
-- 5. Revoke the default PUBLIC EXECUTE on trigger-only definer functions.
------------------------------------------------------------
-- Each of these fires from a trigger and has no client caller. anon and
-- authenticated are named explicitly alongside PUBLIC so the revoke also
-- covers a direct grant applied outside migrations.

revoke all on function public.handle_new_auth_user()                  from public, anon, authenticated;
revoke all on function public.create_member_privacy_defaults()        from public, anon, authenticated;
revoke all on function public.assert_member_id_in_auth_users()        from public, anon, authenticated;
revoke all on function public.sync_area_centroid()                    from public, anon, authenticated;
revoke all on function public.refresh_discoverable_items_on_publish() from public, anon, authenticated;

comment on function public.handle_new_auth_user is
  'F030/T044 signup hook — the only path to a Member row. SECURITY DEFINER over auth.users; EXECUTE revoked from PUBLIC/anon/authenticated (issue #36). Fires from the on_auth_user_created trigger, which does not re-check EXECUTE.';
