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
-- The CHECK is doing real work. A jsonb column with no constraint is a place
-- arbitrary member-supplied structure accumulates, and this one is rendered as
-- href on a public page — `javascript:` in an href is the whole XSS class. The
-- constraint refuses anything that is not a flat object of https URLs on a
-- known platform key. The app validates too; this is the floor under it.

alter table public.groups
  add column social_links jsonb not null default '{}'::jsonb;

comment on column public.groups.social_links is
  'Flat {platform: https-url} map. Platform keys are the closed set in the CHECK below. Empty object means none, never null — a null jsonb column invites three-way logic for "no links".';

-- A flat object only: no nesting, no arrays.
alter table public.groups
  add constraint groups_social_links_is_object
  check (jsonb_typeof(social_links) = 'object');

-- Closed platform set. Adding one is a migration on purpose: an open key space
-- is an open redirect surface with a label attached.
alter table public.groups
  add constraint groups_social_links_known_platforms
  check (
    not exists (
      select 1
      from jsonb_object_keys(social_links) as k
      where k not in ('instagram','facebook','tiktok','x','youtube','bluesky','website')
    )
  );

-- Every value is an https URL, and nothing else. http is refused too: a link
-- the platform ships to a member should not downgrade their connection.
alter table public.groups
  add constraint groups_social_links_https_only
  check (
    not exists (
      select 1
      from jsonb_each_text(social_links) as e(k, v)
      where jsonb_typeof(social_links -> e.k) <> 'string'
         or v !~ '^https://[^[:space:]]{1,500}$'
    )
  );
