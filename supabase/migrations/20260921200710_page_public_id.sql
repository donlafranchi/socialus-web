-- Issue #175 — a Page a member created has no reachable URL.
--
-- Spec anchors:
--   ops-pattern planning/URL-IDENTITY.md          (ruled by Don, 2026-09-21)
--   ops-pattern product/foundation/nouns.md § Page
--   supabase/migrations/014_groups.sql            (groups.slug, unique today)
--   src/lib/groups/page-handle.ts                 (the read half of this)
--
-- WHY A PAGE HAD NO URL. `group_url_prefixes` (037) builds a Page's address
-- from `locations.place_id`, and nothing has ever populated that column for a
-- member-created Location — the only insert in the tree writes six columns and
-- not that one. Every seeded Page sets it, so every demo looked right and only
-- the Pages people actually made were dead.
--
-- THE FIX IS NOT TO POPULATE IT. Don ruled the address itself on 2026-09-21,
-- in his own words: "addresses/locations will evolve … right now we're using
-- metros but one day may use neighborhoods", and "I'm concerned about a URL
-- being downstream of a member. I want to keep members safe from people with
-- bad intentions." A place path in the canonical address violates the first by
-- construction. So a Page's address stops being derived from geography at all,
-- and this column is what it is derived from instead.
--
-- Place, city, metro and neighbourhood remain, as INDEXES that link to the
-- canonical address. `place_id` still wants populating for those, for
-- breadcrumbs and for scoping — that is real and is not this migration.

------------------------------------------------------------
-- 1. The generator
------------------------------------------------------------

-- Crockford base32, lower-case: digits and letters minus i, l, o and u. That
-- kills the look-alike pairs (0/O, 1/l/I) for anyone reading an address aloud,
-- and dropping u blocks most accidental words. The same 32 characters in the
-- same order appear in src/lib/groups/page-handle.ts, and a test compares the
-- two strings — one alphabet, read from both sides.
--
-- RANDOM, FROM A CSPRNG, AND NEVER DERIVED. Not from a member id, a group id,
-- a timestamp or a sequence. Derivation is what would reintroduce both
-- enumerability and the member link the ruling exists to remove, so this is
-- the one property here that is not a preference. `gen_random_bytes` is
-- pgcrypto's CSPRNG; `%32` over a 0..255 byte is exactly uniform (256 = 8×32),
-- so no character is likelier than another.
--
-- SIX CHARACTERS, not four. Four is 32^4 ~ 1.05M values and a birthday
-- collision becomes likely around 1,200 Pages, which one metro reaches. Six is
-- 32^6 ~ 1.07B, likely around 38,000. Don's example was four; six is the
-- recommendation and the unique index makes either one a retry rather than a
-- duplicate.

create or replace function public.new_page_public_id()
returns text
language plpgsql
volatile
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  alphabet constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  candidate text;
  i int;
  attempts int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate ||
        substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.public_id = candidate);
    attempts := attempts + 1;
    -- Generate-and-retry, bounded. At 32^6 a second collision is already
    -- vanishingly unlikely; a loop that cannot end is how a full keyspace
    -- becomes a hung insert rather than a loud one.
    if attempts > 20 then
      raise exception 'new_page_public_id: could not find a free id in % attempts', attempts;
    end if;
  end loop;
  return candidate;
end;
$$;

comment on function public.new_page_public_id() is
  'Mints a Page''s public id: six Crockford base32 characters (digits and letters minus i, l, o, u) from pgcrypto''s CSPRNG, retried against the unique index. Never derived from a member id, group id, timestamp or sequence — derivation would reintroduce the enumerability and the member link the URL ruling of 2026-09-21 removes. Ruling: ops-pattern planning/URL-IDENTITY.md.';

------------------------------------------------------------
-- 2. groups.public_id
------------------------------------------------------------

alter table public.groups
  add column if not exists public_id text;

-- Backfill before the NOT NULL. Every existing Page gets one, including the
-- drafts: a draft becomes live without changing address, and minting the id
-- late would mean a Page's address depends on when it was published.
update public.groups
   set public_id = public.new_page_public_id()
 where public_id is null;

-- Unique first, so the generator's existence check has an index to use and a
-- concurrent insert cannot slip a duplicate past the loop. Case is not folded
-- here because writes are lower-case by construction — the alphabet has no
-- upper-case character in it — and a reader's upper-case input is folded in
-- TypeScript before it reaches a query.
create unique index if not exists idx_groups_public_id
  on public.groups (public_id);

alter table public.groups
  alter column public_id set default public.new_page_public_id();

alter table public.groups
  alter column public_id set not null;

-- The length and the alphabet, enforced rather than assumed. A hand-written
-- row with a 4-character id would produce an address that parses as not-found
-- in TypeScript and nowhere else.
alter table public.groups
  drop constraint if exists groups_public_id_shape;

alter table public.groups
  add constraint groups_public_id_shape
  check (public_id ~ '^[0-9abcdefghjkmnpqrstvwxyz]{6}$');

comment on column public.groups.public_id is
  'What a Page''s canonical URL resolves by — /g/<slug>-<public_id>. The slug in that address is cosmetic and may change freely; this is identity, so a link somebody already sent keeps working. No geography and no member is derivable from it (ruled 2026-09-21, ops-pattern planning/URL-IDENTITY.md). Six Crockford base32 characters, minted by public.new_page_public_id().';

------------------------------------------------------------
-- 3. groups.slug stays unique, for now, and here is why
------------------------------------------------------------

-- The ruling says global uniqueness on `slug` "becomes meaningless and should
-- be dropped" once identity moves to the id, and it is right. It is NOT
-- dropped here: every place path already shared resolves by slug, and those
-- paths redirect to canonical for as long as anybody's links point at them. A
-- slug that is no longer unique makes that redirect ambiguous.
--
-- Dropping it is a separate, reversible change once the redirect no longer
-- needs it. Left as a comment rather than a TODO nobody reads.

------------------------------------------------------------
-- 4. Nothing here is derived from payment
------------------------------------------------------------

-- Not the id, not its length, not whether a Page has one. Every Page gets an
-- address on the same terms.
