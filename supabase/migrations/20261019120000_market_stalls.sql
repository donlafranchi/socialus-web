-- #955 (Don, 2026-10-18: "Go") — a Page that sells at a market Page, with no place of its own.
--   market_stalls   the vendor Page, the market Page, when (every market day, or listed dates) and the dates it skips.
--                   Anyone reads a stall whose two Pages they can read. Only the vendor Page's managers write one;
--                   the market Page's managers may remove it (confirming goes through the action layer).
-- post_reminders gains a third target, stall_id: "Remind me" on a vendor reminds on each market day it attends.

create table public.market_stalls (
  id               uuid        primary key default gen_random_uuid(),
  vendor_group_id  uuid        not null references public.groups(id) on delete cascade,
  market_group_id  uuid        not null references public.groups(id) on delete cascade,
  every_week       boolean     not null default true,
  dates            date[]      not null default '{}',
  skip_dates       date[]      not null default '{}',
  confirmed_at     timestamptz,
  created_by       uuid        references public.members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint market_stalls_one_per_market unique (vendor_group_id, market_group_id),
  constraint market_stalls_not_itself check (vendor_group_id <> market_group_id),
  constraint market_stalls_when check (every_week or cardinality(dates) between 1 and 52),
  constraint market_stalls_dates_max check (cardinality(dates) <= 52 and cardinality(skip_dates) <= 52)
);

create index idx_market_stalls_market on public.market_stalls (market_group_id);

alter table public.market_stalls enable row level security;
revoke all on public.market_stalls from anon, authenticated;
grant select on public.market_stalls to anon, authenticated;
grant insert, update, delete on public.market_stalls to authenticated;

-- groups' own policies decide which Pages a reader can see; a stall shows only when both can be seen.
create policy market_stalls_select on public.market_stalls for select to anon, authenticated
  using (vendor_group_id in (select id from public.groups) and market_group_id in (select id from public.groups));

create policy market_stalls_vendor_insert on public.market_stalls for insert to authenticated
  with check (vendor_group_id in (select public.current_member_managing_group_ids()));

create policy market_stalls_vendor_update on public.market_stalls for update to authenticated
  using (vendor_group_id in (select public.current_member_managing_group_ids()))
  with check (vendor_group_id in (select public.current_member_managing_group_ids()));

create policy market_stalls_delete on public.market_stalls for delete to authenticated
  using (
    vendor_group_id in (select public.current_member_managing_group_ids())
    or market_group_id in (select public.current_member_managing_group_ids())
  );

alter table public.post_reminders
  add column stall_id uuid references public.market_stalls(id) on delete cascade,
  drop constraint post_reminders_one_target,
  add constraint post_reminders_one_target check (num_nonnulls(post_id, series_id, stall_id) = 1);

create unique index post_reminders_member_stall on public.post_reminders (member_id, stall_id) where stall_id is not null;
