-- #916 — groups grants its columns one by one, and a column added later is granted to anon and authenticated
-- unless it names a member, where the Page is, or how to reach it (tests/front-door-db.test.ts). search_tsv is
-- the stems of the name and description, which both already read.
grant select (search_tsv) on public.groups to anon, authenticated;
