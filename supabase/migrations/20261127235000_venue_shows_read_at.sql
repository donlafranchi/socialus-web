-- #1536 (the PM, 2026-11-27: "every venue page, that wording"): a venue Page says when its shows were last updated.
--
-- shows_read_at: when the daily venue import (scripts/unclaimed/events.ts, syncVenueShows) last read this Page's shows,
-- written in the same transaction as the shows. Null for a Page with no imported shows. Read like the Page's other public
-- fields; no app role writes it.
--
-- Backfill: each unclaimed Page with imported shows gets the latest time one of them was written, so a venue no longer
-- read (Ace of Spades, #1485) has a date from the start. Additive: nothing else changes.

alter table public.groups add column shows_read_at timestamptz;
comment on column public.groups.shows_read_at is
  'When the daily venue import last read this Page''s shows (#1536). Null when none are imported.';

update public.groups g
   set shows_read_at = p.at
  from (select group_id, max(greatest(created_at, updated_at)) as at
          from public.page_posts where event_key is not null group by group_id) p
 where p.group_id = g.id and g.unclaimed_at is not null;

grant select (shows_read_at) on public.groups to anon, authenticated;
