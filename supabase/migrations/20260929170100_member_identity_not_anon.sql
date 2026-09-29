-- bug #241, part 2 of 2 — a public Page does not hand a stranger the member
-- ids behind it.
--
-- Spec anchors:
--   socialus-web #241                        (launch-blocking)
--   ops-pattern/DECISIONS.md 2026-09-21      (canonical URL: no member derivable;
--                                             two member-identity leaks)
--
-- TWO ROUTES, BOTH CONFIRMED ON PRODUCTION 2026-09-29:
--   1. member_public_group_memberships is granted to anon and has no direction:
--      ?slug=eq.<slug> returns the member ids of that Page.
--   2. groups.founder_member_id reaches anon, because RLS is row-level and no
--      column grant narrowed it.
--
-- FOR anon ONLY; `authenticated` keeps both. REQUIRES part 1
-- (20260929170000) AND ITS CODE TO BE LIVE: code that still embeds through
-- founder_member_id fails the whole read for a stranger and 404s the Page.

revoke select on public.member_public_group_memberships from anon;

-- Column privileges only narrow when the table-level grant is gone, so anon's
-- SELECT is rebuilt as every column but one. A column added to groups later is
-- invisible to anon until granted; tests/member-identity-anon-db.test.ts fails
-- on that rather than a signed-out Page failing on it.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'groups'
     and column_name <> 'founder_member_id';
  execute 'revoke select on public.groups from anon';
  execute format('grant select (%s) on public.groups to anon', cols);
end
$$;

-- A policy's SUBQUERY runs with the caller's privileges, so page_posts'
-- founder check would now refuse anon every read of page_posts. auth.uid() is
-- null for anon, so it never admitted anon a row; scoping it to authenticated
-- changes nothing but that. (The groups policies read the column in their own
-- quals, which Postgres does not check against column grants; they stay.)
drop policy if exists page_posts_select_own on public.page_posts;
create policy page_posts_select_own
  on public.page_posts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.groups g
       where g.id = page_posts.group_id
         and g.founder_member_id = auth.uid()
    )
  );
