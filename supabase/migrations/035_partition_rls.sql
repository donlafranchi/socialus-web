-- T110 — RLS on event-log partitions + reserved embedding tables.
-- Source: Supabase security advisor (rls_disabled_in_public), 2026-08-31.
--
-- THE BUG. The five `ensure_*_events_partition()` helpers create each monthly
-- partition with `create table ... partition of ...` and never enable RLS on
-- it. A partition does NOT inherit the parent's rowsecurity flag, and
-- PostgREST exposes every partition in the `public` schema as its own
-- endpoint. Result: `anon` held SELECT *and* INSERT on all 15 existing
-- partitions — the append-only audit log was directly readable and forgeable
-- with the publishable key, bypassing the parent's policies entirely.
--
-- This recurs. `rotate_*_partitions()` runs monthly and would reopen the hole
-- with each new partition, silently and after launch. Patching the helpers is
-- the load-bearing half of this migration; the backfill below only closes
-- today's instance.
--
-- NO POLICIES ARE ADDED, DELIBERATELY. RLS with zero policies is deny-all for
-- non-bypass roles, which is the correct end state: every legitimate read goes
-- through the parent table, where the existing policies apply. The action
-- layer connects as `postgres` (BYPASSRLS), so writes are unaffected. No
-- application code references a partition by name.
--
-- `public.spatial_ref_sys` is deliberately NOT touched — it is owned by
-- `supabase_admin` (the ALTER would fail as `postgres`) and holds PostGIS
-- coordinate-system reference data with no privacy surface. It is allowlisted
-- in tests/rls-coverage.test.ts instead.

------------------------------------------------------------
-- 1. Patch the five partition helpers to enable RLS at creation.
------------------------------------------------------------

create or replace function public.ensure_member_events_partition(target_month date)
returns void
language plpgsql
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

  -- Partitions do not inherit the parent's rowsecurity flag. Without this the
  -- partition is anon-readable and anon-writable via PostgREST. Idempotent.
  execute format('alter table public.%I enable row level security', partition_name);
end;
$$;

create or replace function public.ensure_location_events_partition(target_month date)
returns void
language plpgsql
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
-- 2. Backfill every partition that already exists.
------------------------------------------------------------
-- Driven off pg_inherits rather than a hardcoded month list, so this stays
-- correct however many partitions have been rotated into existence.

do $$
declare
  parent_name text;
  part        regclass;
begin
  foreach parent_name in array array[
    'public.member_events',
    'public.location_events',
    'public.group_events',
    'public.item_events',
    'public.place_events'
  ]
  loop
    for part in
      select inhrelid::regclass
        from pg_inherits
       where inhparent = parent_name::regclass
    loop
      execute format('alter table %s enable row level security', part::text);
    end loop;
  end loop;
end;
$$;

------------------------------------------------------------
-- 3. Reserved embedding tables.
------------------------------------------------------------
-- Substrate at b1 — populated by the T3 embedding pipeline, no surface and no
-- application reads (only service-role evals introspect their shape). Deny-all
-- is the correct posture until a read path is designed.

alter table public.item_embeddings   enable row level security;
alter table public.member_embeddings enable row level security;

comment on function public.ensure_member_events_partition is
  'Creates the monthly member_events partition if absent and enables RLS on it. The RLS step is load-bearing: partitions do not inherit the parent rowsecurity flag, and PostgREST exposes each partition as its own endpoint.';
