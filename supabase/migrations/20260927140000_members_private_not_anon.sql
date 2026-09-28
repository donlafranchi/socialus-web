-- bug #178 — a member marked private is not handed to a stranger.
--
-- Spec anchors:
--   socialus-web #178                       (launch-blocking)
--   ops-pattern/DECISIONS.md 2026-09-23     (F093: withholding is enforced in SQL)
--   ops-pattern/process/ABSOLUTES.md        ([guard-proves-itself])
--
-- THE BUG. `members.stakeholder_visibility` has existed since 002, defaults to
-- 'private', and `members_public_read` never read it. So every member,
-- including every real signup (all of whom are 'private', because nothing can
-- change the default), was returned in full to an anonymous caller of
-- `https://<ref>.supabase.co/rest/v1/members` — an origin no robots.txt and no
-- Vercel firewall sits in front of, with a key that ships in our own bundle.
-- The seeds mark their showcase members 'public', which is why nothing looked
-- wrong (bug #175's lesson).
--
-- THE FIX IS ONE CLAUSE FOR ONE ROLE, shaped like 20260923161500: the policy
-- is split by role, `authenticated` keeps byte-for-byte the read it had, and
-- `anon` additionally requires the member to be marked 'public'.
--
-- WHAT THIS DOES NOT DECIDE, and must not be read as deciding (#178, Don's):
--   * WHICH COLUMNS a stranger may see on a public member. A public member's
--     row still reaches anon whole, `home_location_id` included.
--   * WHAT THE THREE VALUES MEAN beyond the one reading this needs. Only
--     'public' names an audience that includes a stranger, so only 'public'
--     reaches anon — 'community_only' is held back with 'private', failing
--     closed. What 'private' or 'community_only' mean to a SIGNED-IN viewer is
--     untouched: every signed-in reader still sees every live member.
--   * How this relates to `member_privacy.profile_visibility`, the audience
--     gate /m/[handle] already applies. Both now gate anon; they are separate
--     columns and nothing here reconciles them.

drop policy if exists members_public_read on public.members;

-- A SIGNED-IN reader: unchanged. The `using` clause is byte-for-byte 002's.
create policy members_public_read
  on public.members
  for select
  to authenticated
  using (deleted_at is null and login_disabled = false);

-- A STRANGER: only members marked public. Written as a role, like F093, so an
-- anonymous request is judged by exactly this policy and no other.
create policy members_anon_read_public
  on public.members
  for select
  to anon
  using (
    deleted_at is null
    and login_disabled = false
    and stakeholder_visibility = 'public'
  );

comment on policy members_anon_read_public on public.members is
  'bug #178 — anon reads only members whose stakeholder_visibility is ''public''. The column defaults to ''private'' and was never read by any policy before this, so every real signup was readable anonymously over PostgREST. Which columns a stranger may see, and what the values mean to a signed-in viewer, are unruled (#178) and not decided here.';
