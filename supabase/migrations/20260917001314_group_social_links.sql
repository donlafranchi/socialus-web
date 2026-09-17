-- F070 — a Page carries its own links out.
--
-- One jsonb column on groups, shaped {platform: url}. Precedent for jsonb on a
-- spine row is locations.ambient_extras.
--
-- Why not a table: the set is small, bounded, always read with the Page and
-- never queried across Pages. A group_social_links table would be a join on
-- every Page render to answer a question nobody asks of the set as a whole.
--
-- Why not columns per platform: every new platform is a migration, and the
-- platform list is exactly the thing that changes without warning.
--
-- The constraints are doing real work. A jsonb column with no constraint is a
-- place arbitrary member-supplied structure accumulates, and this one is
-- rendered as href on a public page — `javascript:` in an href is the whole XSS
-- class. The app validates too; this is the floor under it.
--
-- Why helper functions rather than inline predicates: Postgres refuses a
-- subquery in a CHECK (SQLSTATE 0A000), and inspecting an object's keys or
-- values needs a set-returning function. An IMMUTABLE function over the
-- argument alone is the sanctioned way to do that, and CI caught the inline
-- version before it ever reached production.

alter table public.groups
  add column social_links jsonb not null default '{}'::jsonb;

comment on column public.groups.social_links is
  'Flat {platform: https-url} map. Platform keys are the closed set in social_links_keys_known(). Empty object means none, never null — a null jsonb column invites three-way logic for "no links".';

-- Every key is a platform we recognise. An open key space on a column rendered
-- as href is an open redirect surface with a label attached.
create or replace function public.social_links_keys_known(links jsonb)
returns boolean
language sql
immutable
parallel safe
-- Pinned, per issue #36: a function that ships with a mutable search_path is
-- the finding that hardening closed, and the suite enforces it.
set search_path = public, pg_catalog
as $$
  select coalesce(
    bool_and(k in ('instagram','facebook','tiktok','x','youtube','bluesky','website')),
    true
  )
  from jsonb_object_keys(links) as k
$$;

-- Every value is an https URL and nothing else. http is refused too: a link the
-- platform ships to a member should not downgrade their connection.
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
      and (links ->> k) ~ '^https://[^[:space:]]{1,500}$'
    ),
    true
  )
  from jsonb_object_keys(links) as k
$$;

alter table public.groups
  add constraint groups_social_links_is_object
  check (jsonb_typeof(social_links) = 'object');

alter table public.groups
  add constraint groups_social_links_known_platforms
  check (public.social_links_keys_known(social_links));

alter table public.groups
  add constraint groups_social_links_https_only
  check (public.social_links_values_https(social_links));
