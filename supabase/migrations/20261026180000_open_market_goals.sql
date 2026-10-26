-- #1090 — Don, 2026-10-26: a market that isn't open yet opens next at 100 makers
-- and 1,000 supporters (was 50 and 250, F076). Open markets keep what they had.
alter table public.metro_polygons alter column creator_threshold set default 100, alter column patron_threshold set default 1000;
update public.metro_polygons set creator_threshold = 100, patron_threshold = 1000 where not is_open;
alter table public.markets alter column creator_threshold set default 100, alter column patron_threshold set default 1000;
update public.markets set creator_threshold = 100, patron_threshold = 1000 where not is_open;

-- A maker's website or socials, optional. The row stays readable by its owner
-- only (metro_waitlist_select_own); staff read it with the service role.
alter table public.metro_waitlist add column link text check (link is null or char_length(link) between 1 and 300);
