-- 041 part 1 of 2 — pin search_path on the 14 functions that shipped without one.
-- Issue #36. Bodies identical to the versions already in production; the only
-- change is the added `set search_path`.
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
