-- #1139 — readable addresses (Don, 2026-11-01; replaces the 2026-10-06 ID-only ruling, #411).
--   Page: /<place>-<st>/<page-slug>             e.g. /sacramento-ca/plant-foundry
--   Post: /<place>-<st>/<page-slug>/<post-slug>
-- The place is the Page's home town, set when the Page is first published (not while it is a draft), never
-- derived from its current address afterwards; the Page slug is frozen with it, the post slug when the post goes
-- live. The id (public_id, the post uuid) still resolves internally, and /g/<id> forwards here.
--
-- Place order: our own places list (Census places incl. CDPs, by polygon, then the location's place), the postal
-- city in the street address, then the county. Never the founder's home: a URL is not downstream of a member.
-- Uniqueness is the pair (place, page slug); a same-name Page in the same place gets its neighbourhood, then -2.

------------------------------------------------------------
-- Words no place, Page or post slug may take. src/lib/addresses/reserved.ts holds the same list; a test compares.
------------------------------------------------------------
create function public.url_reserved(p text) returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  select p = any (array[
    'about', 'add-entity-demo', 'admin', 'api', 'apple-icon', 'auth', 'business', 'card-gallery', 'composer-demo',
    'create', 'edit', 'explore', 'favicon', 'following', 'fonts', 'g', 'icons', 'join', 'landing', 'm', 'manifest',
    'map', 'offline', 'og-default', 'onboarding', 'open', 'p', 'playground', 'posts', 'privacy', 'push-sw', 'qr',
    'register-business', 'report', 'robots', 'rules', 'sitemap', 'storage', 'sw', 'terms', 'unclaimed-demo',
    'welcome', 'you'
  ])
$$;

------------------------------------------------------------
-- Name to slug: emails and phone numbers dropped (the patterns of src/lib/text/contact-info.ts: an address is never
-- frozen into a public URL), lower case, accents folded, & as "and", apostrophes dropped, anything else a hyphen, cut
-- at a word boundary. Null when nothing is left.
------------------------------------------------------------
create function public.url_slugify(p text, p_max int default 60) returns text
language plpgsql immutable parallel safe
set search_path = public
as $$
declare
  v text := coalesce(p, '');
begin
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', ' ', 'g');
  v := regexp_replace(v, '(\+?1[\s.-]?)?(\(\d{3}\)|\m\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\M', ' ', 'g');
  v := lower(v);
  v := translate(v, 'àáâãäåāèéêëēìíîïīòóôõöøōùúûüūñçýÿ', 'aaaaaaaeeeeeiiiiioooooooouuuuuncyy');
  v := replace(v, '&', ' and ');
  v := regexp_replace(v, '[''’]', '', 'g');
  v := trim(both '-' from regexp_replace(v, '[^a-z0-9]+', '-', 'g'));
  if char_length(v) > p_max then
    v := case when substr(v, p_max + 1, 1) = '-' then left(v, p_max) else regexp_replace(left(v, p_max), '-[^-]*$', '') end;
    v := trim(both '-' from v);
  end if;
  return nullif(v, '');
end
$$;

------------------------------------------------------------
-- Places: url_slug, always state-suffixed (sacramento-ca, placer-county-ca). Two same-named places in one state
-- add the county (lakeside-san-diego-ca). Frozen once a Page uses it (the foreign key below, on update restrict).
------------------------------------------------------------
create table public.place_url_overrides (
  place_id     uuid primary key references public.places(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  url_slug     text not null unique check (url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$')
);
alter table public.place_url_overrides enable row level security;
comment on table public.place_url_overrides is
  '#1139 — the curated fix for an awkward Census name: the name to show and the slug to use. Read when a place gets its url_slug.';

alter table public.places
  add column url_slug text check (url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$' and char_length(url_slug) <= 100),
  add constraint places_url_slug_key unique (url_slug);

create function public.places_set_url_slug() returns trigger
language plpgsql
set search_path = public
as $$
declare
  st text;
  county text;
  o public.place_url_overrides;
  base text;
  cand text;
  n int := 2;
begin
  select * into o from public.place_url_overrides where place_id = new.id;
  if o.place_id is not null and o.display_name is not null then new.display_name := o.display_name; end if;
  if new.url_slug is not null or new.kind not in ('city', 'county') or new.deleted_at is not null then return new; end if;
  if o.place_id is not null then new.url_slug := o.url_slug; return new; end if;
  select s.slug into st from public.places s where s.id = new.ancestor_state_id and s.kind = 'state';
  if st is null or st !~ '^[a-z]{2}$' then return new; end if;
  base := new.slug || case when new.kind = 'county' then '-county' else '' end;
  cand := base || '-' || st;
  if exists (select 1 from public.places p where p.url_slug = cand and p.id <> new.id) and new.kind = 'city' then
    select c.slug into county from public.places c where c.id = new.parent_id and c.kind = 'county';
    if county is not null then base := new.slug || '-' || county; cand := base || '-' || st; end if;
  end if;
  while exists (select 1 from public.places p where p.url_slug = cand and p.id <> new.id) loop
    cand := base || '-' || n || '-' || st;
    n := n + 1;
  end loop;
  new.url_slug := cand;
  return new;
end
$$;

-- Named after places_set_ancestor_state_id so it runs second and sees the state.
create trigger places_set_url_slug
  before insert or update of slug, kind, parent_id, deleted_at, url_slug, display_name on public.places
  for each row execute function public.places_set_url_slug();

-- Backfill, oldest first, so an established place keeps the plain slug. updated_at is left alone.
alter table public.places disable trigger places_set_updated_at;
do $$
declare r record;
begin
  for r in select id from public.places where kind in ('city', 'county') and deleted_at is null and url_slug is null
            order by case kind when 'city' then 0 else 1 end, created_at, id loop
    update public.places set url_slug = null where id = r.id;
  end loop;
end
$$;
alter table public.places enable trigger places_set_updated_at;

------------------------------------------------------------
-- A Page's home place: city polygon, the location's own place (or its city), the postal city, the county.
------------------------------------------------------------
create function public.page_home_place_slug(p_anchor uuid) returns text
language sql stable
set search_path = public, extensions
as $$
  select coalesce(
    (select p.url_slug from public.locations l join public.places p
        on p.kind = 'city' and p.deleted_at is null and p.url_slug is not null and p.geography is not null
       and st_covers(p.geography, l.geography)
      where l.id = p_anchor order by st_area(p.geography::geometry) limit 1),
    (select coalesce(case when p.kind in ('city', 'county') then p.url_slug end, up.url_slug)
       from public.locations l join public.places p on p.id = l.place_id
       left join public.places up on up.id = p.parent_id and up.kind = 'city' and up.deleted_at is null
      where l.id = p_anchor),
    (select p.url_slug from public.location_permanent lp
       cross join lateral regexp_match(lp.street_address, ',\s*([^,]+?),\s*([A-Za-z]{2})\M') m
       join public.places s on s.kind = 'state' and s.slug = lower(m[2])
       join public.places p on p.kind = 'city' and p.ancestor_state_id = s.id and p.deleted_at is null
        and p.url_slug is not null and lower(p.display_name) = lower(btrim(m[1]))
      where lp.location_id = p_anchor limit 1),
    (select p.url_slug from public.locations l join public.places p
        on p.kind = 'county' and p.deleted_at is null and p.url_slug is not null and p.geography is not null
       and st_covers(p.geography, l.geography)
      where l.id = p_anchor order by st_area(p.geography::geometry) limit 1)
  )
$$;

------------------------------------------------------------
-- Pages: (place_url_slug, page_url_slug), unique as a pair, set at first publish, then immutable.
------------------------------------------------------------
alter table public.groups
  add column place_url_slug text references public.places(url_slug) on update restrict on delete restrict,
  add column page_url_slug text check (page_url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(page_url_slug) <= 80),
  add constraint groups_url_address_key unique (place_url_slug, page_url_slug),
  add constraint groups_url_address_whole check ((place_url_slug is null) = (page_url_slug is null));

grant select (place_url_slug, page_url_slug) on public.groups to anon, authenticated;

create function public.page_url_slug_for(p_group_id uuid, p_name text, p_place text, p_anchor uuid) returns text
language plpgsql stable
set search_path = public, extensions
as $$
declare
  base text := coalesce(public.url_slugify(p_name, 60), 'page');
  cand text := base;
  nb text;
  n int := 2;
  taken constant text := 'select public.url_reserved($1) or exists (select 1 from public.places where url_slug = $1)
    or exists (select 1 from public.groups where place_url_slug = $2 and page_url_slug = $1 and id <> $3)';
  t boolean;
begin
  -- Two Pages of one name publishing at once in one place would both pick the same slug; one waits for the other.
  perform pg_advisory_xact_lock(hashtext('page-url:' || p_place || '/' || base));
  execute taken into t using cand, p_place, p_group_id;
  if not t then return cand; end if;
  select p.slug into nb from public.locations l join public.places p
      on p.kind = 'neighborhood' and p.deleted_at is null and p.geography is not null and st_covers(p.geography, l.geography)
    where l.id = p_anchor order by st_area(p.geography::geometry) limit 1;
  if nb is not null and nb <> base then
    cand := base || '-' || nb;
    execute taken into t using cand, p_place, p_group_id;
    if not t then return cand; end if;
  end if;
  loop
    cand := base || '-' || n;
    execute taken into t using cand, p_place, p_group_id;
    if not t then return cand; end if;
    n := n + 1;
  end loop;
end
$$;

create function public.groups_url_address() returns trigger
language plpgsql
set search_path = public
as $$
declare place text;
begin
  -- An operator re-mints a frozen address only on purpose: set local app.address_override = 'on'.
  if tg_op = 'UPDATE' and old.page_url_slug is not null and coalesce(current_setting('app.address_override', true), '') <> 'on' then
    if new.place_url_slug is distinct from old.place_url_slug or new.page_url_slug is distinct from old.page_url_slug then
      raise exception 'A Page''s address is frozen once set (%/%)', old.place_url_slug, old.page_url_slug
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.page_url_slug is not null then return new; end if;
  if new.page_url_slug is not null or new.lifecycle_state in ('draft', 'dissolved') then return new; end if;
  place := public.page_home_place_slug(new.anchor_location_id);
  if place is null then return new; end if;
  new.place_url_slug := place;
  new.page_url_slug := public.page_url_slug_for(new.id, new.name, place, new.anchor_location_id);
  return new;
end
$$;

-- The backfill leaves updated_at alone: Explore orders by it.
alter table public.groups disable trigger groups_set_updated_at;

-- Plant Foundry, as Don named it (the generator would say the-plant-foundry-nursery-and-store).
update public.groups set place_url_slug = 'sacramento-ca', page_url_slug = 'plant-foundry'
 where public_id = '81bjk0' and exists (select 1 from public.places where url_slug = 'sacramento-ca');

-- Every other published Page, unclaimed too, oldest first so the first of two names keeps the plain slug.
do $$
declare r record; place text;
begin
  for r in select id, name, anchor_location_id from public.groups
            where page_url_slug is null and lifecycle_state not in ('draft', 'dissolved') order by created_at, id loop
    place := public.page_home_place_slug(r.anchor_location_id);
    continue when place is null;
    update public.groups set place_url_slug = place, page_url_slug = public.page_url_slug_for(r.id, r.name, place, r.anchor_location_id)
     where id = r.id;
  end loop;
end
$$;
alter table public.groups enable trigger groups_set_updated_at;

create trigger groups_url_address
  before insert or update on public.groups
  for each row execute function public.groups_url_address();

------------------------------------------------------------
-- Posts: url_slug from the headline, unique per Page, set when the post goes live, then immutable. With no
-- headline it is the kind and, for a dated post, its day (event-nov-3): never a line of the body, which a
-- signed-out reader may not read.
------------------------------------------------------------
alter table public.page_posts
  add column url_slug text check (url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(url_slug) <= 80);
create unique index page_posts_url_slug_key on public.page_posts (group_id, url_slug) where url_slug is not null;

create function public.post_url_slug_for(p_id uuid, p_group_id uuid, p_headline text, p_kind text, p_starts_at timestamptz)
returns text
language plpgsql stable
set search_path = public
as $$
declare
  base text := coalesce(
    public.url_slugify(p_headline, 50),
    public.url_slugify(coalesce(p_kind, 'post') || coalesce(' ' || to_char(p_starts_at at time zone 'America/Los_Angeles', 'mon FMDD'), ''), 50),
    'post');
  cand text := base;
  n int := 2;
begin
  perform pg_advisory_xact_lock(hashtext('post-url:' || p_group_id || '/' || base));
  while public.url_reserved(cand)
     or exists (select 1 from public.page_posts where group_id = p_group_id and url_slug = cand and id <> p_id) loop
    cand := base || '-' || n;
    n := n + 1;
  end loop;
  return cand;
end
$$;

create function public.page_posts_url_slug() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.url_slug is not null and coalesce(current_setting('app.address_override', true), '') <> 'on' then
    if new.url_slug is distinct from old.url_slug then
      raise exception 'A post''s address is frozen once set (%)', old.url_slug using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.url_slug is not null then return new; end if;
  if new.url_slug is null and new.lifecycle_state = 'active' then
    new.url_slug := public.post_url_slug_for(new.id, new.group_id, new.headline, new.kind, new.starts_at);
  end if;
  return new;
end
$$;

do $$
declare r record;
begin
  for r in select id, group_id, headline, kind, starts_at from public.page_posts
            where url_slug is null and lifecycle_state = 'active' order by created_at, id loop
    update public.page_posts set url_slug = public.post_url_slug_for(r.id, r.group_id, r.headline, r.kind, r.starts_at)
     where id = r.id;
  end loop;
end
$$;

create trigger page_posts_url_slug
  before insert or update on public.page_posts
  for each row execute function public.page_posts_url_slug();

------------------------------------------------------------
-- Reads. Each answers only for what a signed-out reader could already reach, restated because security definer
-- skips RLS: a published, listed Page (shared_post_preview's rule), not hidden unclaimed and with its words not
-- hidden (the slug is made of them), and for a post, a live listed one.
------------------------------------------------------------

-- Where /g/<id> and /g/<id>/posts/<post id> now live. No row: the old route answers as before.
create function public.page_address(p_public_id text, p_post_id uuid default null)
returns table (place_url_slug text, page_url_slug text, post_url_slug text)
language sql stable security definer
set search_path = public
as $$
  select g.place_url_slug, g.page_url_slug, pp.url_slug
    from public.groups g
    left join public.page_posts pp on pp.id = p_post_id and pp.group_id = g.id
     and pp.lifecycle_state = 'active' and pp.discoverability = 'listed' and pp.dissolved_at is null
     and pp.hidden_at is null and pp.removed_at is null
   where g.public_id = p_public_id
     and g.page_url_slug is not null
     and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null
     and g.unclaimed_hidden_at is null and g.words_hidden_at is null and g.words_removed_at is null
     and public.builder_visible(g.founder_member_id)
     and (p_post_id is null or pp.url_slug is not null)
$$;

-- A post on a Page by its slug, signed out (page_posts has no anonymous read).
create function public.page_post_id_by_slug(p_group_id uuid, p_slug text) returns uuid
language sql stable security definer
set search_path = public
as $$
  select pp.id from public.page_posts pp join public.groups g on g.id = pp.group_id
   where pp.group_id = p_group_id and pp.url_slug = p_slug
     and pp.lifecycle_state = 'active' and pp.discoverability = 'listed' and pp.dissolved_at is null
     and pp.hidden_at is null and pp.removed_at is null
     and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null
     and g.unclaimed_hidden_at is null and g.words_hidden_at is null and g.words_removed_at is null
     and public.builder_visible(g.founder_member_id)
$$;

-- Post slugs for cards Explore already shows (their share links).
create function public.post_url_slugs(p_post_ids uuid[]) returns table (id uuid, url_slug text)
language sql stable security definer
set search_path = public
as $$
  select pp.id, pp.url_slug from public.page_posts pp join public.groups g on g.id = pp.group_id
   where pp.id = any (p_post_ids) and pp.url_slug is not null
     and pp.lifecycle_state = 'active' and pp.discoverability = 'listed' and pp.dissolved_at is null
     and pp.hidden_at is null and pp.removed_at is null
     and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null
     and g.unclaimed_hidden_at is null and g.words_hidden_at is null and g.words_removed_at is null
     and public.builder_visible(g.founder_member_id)
$$;

revoke all on function public.page_address(text, uuid) from public;
revoke all on function public.page_post_id_by_slug(uuid, text) from public;
revoke all on function public.post_url_slugs(uuid[]) from public;
grant execute on function public.page_address(text, uuid) to anon, authenticated;
grant execute on function public.page_post_id_by_slug(uuid, text) to anon, authenticated;
grant execute on function public.post_url_slugs(uuid[]) to anon, authenticated;

comment on column public.groups.place_url_slug is
  '#1139 (Don, 2026-11-01) — the Page''s home town in its address, set at first publish, then frozen. A move changes nothing here.';
comment on column public.groups.page_url_slug is
  '#1139 (Don, 2026-11-01) — the Page''s slug in its address, unique within its place, frozen with it.';
comment on column public.page_posts.url_slug is
  '#1139 (Don, 2026-11-01) — the post''s slug under its Page, from the headline, set when it goes live, then frozen.';
