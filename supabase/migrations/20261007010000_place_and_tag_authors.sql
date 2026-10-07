-- bug #246 — the last two tables that hand out member ids to people who are
-- not party to them (2026-09-30: a signed-in stranger reads no member field;
-- 2026-09-14: no name reachable by lookup or browsing).
--
-- place_events: open to everyone, signed out included, since 017 ("curation
-- history is public infrastructure"), so anyone read who created or edited
-- each place. Now read like every other *_events table: by the member who
-- acted. Nothing in the app reads it.
--
-- tags.created_by: any signed-in member read who made each tag. Nothing in
-- the app selects it; the handlers that write it run as the database owner.
-- The table-wide grant becomes a column list, as groups already is, so a new
-- column is read by nobody until it is named.

drop policy if exists place_events_select_all on public.place_events;

create policy place_events_select_acting_self on public.place_events
  for select
  using (acting_member_id = (select auth.uid()));

revoke select on public.tags from anon, authenticated;
grant select (id, label, normalized, status, created_at) on public.tags to authenticated;
