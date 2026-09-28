-- Issue #231 — the social-links check never compiled.
--
-- 20260917001314 wrote `[^[:space:]]{1,500}`. Postgres caps a repetition bound
-- at 255 (RE_DUP_MAX), so the regex raised 2201B on every non-empty map. The
-- `{}` default never reaches it, which is why the migration applied and every
-- row stayed empty until the first member saved a link.
--
-- Same rule, split in two: the shape by regex, the length by char_length.
-- 'https://' is 8 characters, so 1..500 after it is 9..508 in all. The CHECKs
-- call this function by name, so replacing it is the whole fix.

create or replace function public.social_links_values_https(links jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_catalog
as $$
  select coalesce(
    bool_and(
      jsonb_typeof(links -> k) = 'string'
      and (links ->> k) ~ '^https://[^[:space:]]+$'
      and char_length(links ->> k) <= 508
    ),
    true
  )
  from jsonb_object_keys(links) as k
$$;
