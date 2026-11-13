-- #1299 — F076.3 (the PM approved the waitlist join journey, 2026-11-13): the waitlist entry keeps what the
-- journey asked. Staff-only like the rest of the row (no browser client reads an anonymous row: RLS is
-- member_id = auth.uid(), and anonymous rows have no member), never a type on a member, and deleted with the
-- row once the invite is sent (F076.15). Nothing here is verified: the number is checked at sign-up (F081).

alter table public.metro_waitlist
  add column name       text check (name is null or char_length(btrim(name)) between 1 and 60),
  add column phone      text check (phone is null or phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  add column zip        text check (zip is null or zip ~ '^[0-9]{5}$'),
  add column plans      text[] not null default '{}' check (cardinality(plans) <= 7),
  add column offers     text[] not null default '{}' check (cardinality(offers) <= 7),
  add column offer_name text check (offer_name is null or char_length(offer_name) <= 120),
  add column offer_link text check (offer_link is null or char_length(offer_link) <= 300);

comment on column public.metro_waitlist.name is 'What to call them in the invite: a first or display name, never a legal name. Staff-only.';
comment on column public.metro_waitlist.phone is 'Mobile number as typed, in E.164; not checked at join (F076.18), pre-filled at sign-up where Lookup and the code run (F081). Staff-only.';
comment on column public.metro_waitlist.zip is 'The zip that chose the market (F076.2). Staff-only.';
comment on column public.metro_waitlist.plans is 'What they plan to do, the journey''s chip ids (discover or be found). Counted per market by side; never stored on a member.';
comment on column public.metro_waitlist.offers is 'Being found: the kinds of thing they do. Staff-only; variety per market (F118.9).';
comment on column public.metro_waitlist.offer_name is 'Being found: the business or group name, optional. Later matched to an unclaimed Page at invite.';
comment on column public.metro_waitlist.offer_link is 'Being found: a website or social link, optional.';

-- Staff-only by grant, not only by row policy: a member may read their own row (metro_waitlist_select_own), so the
-- browser roles get the original columns only and never the answers. Nothing in the app reads this table from a
-- browser; the handlers connect as the owner.
revoke select on public.metro_waitlist from anon, authenticated;
grant select (id, member_id, metro_id, role, created_at, updated_at) on public.metro_waitlist to authenticated;
