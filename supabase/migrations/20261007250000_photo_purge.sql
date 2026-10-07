-- #491 — real deletion of a removed photo (docs/purge-proposal.md, option 1).
--
-- Removal stays reversible. Purge is a second, deliberate act on a photo that is
-- already removed, and it deletes the storage object. The media bucket's delete
-- policy let a member delete only their own folder, so the operator could not
-- delete another member's object. This lets the OPERATOR's own session do it, in
-- the media bucket only, without a service-role key.

-- Who the operator is, as far as the database needs to know. Nobody reads this
-- through the API; the app records the verified operator (the OPERATOR_MEMBER_ID
-- env var) the first time a purge is prepared.
create table public.operators (
  member_id  uuid primary key references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.operators enable row level security;
revoke all on public.operators from anon, authenticated;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.operators where member_id = auth.uid());
$$;
revoke all on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;

create policy "media operator delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_operator());

-- The record. Append-only; it survives the bytes.
create table public.photo_purges (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups(id) on delete cascade,
  purged_by_member_id  uuid not null references public.members(id),
  reason_code          text not null check (reason_code in ('illegal_content', 'person_did_not_agree', 'not_suitable', 'other')),
  reason_note          text check (reason_note is null or char_length(reason_note) between 1 and 1000),
  object_path          text not null,
  purged_at            timestamptz not null default now(),
  constraint photo_purges_other_needs_a_note check (reason_code <> 'other' or reason_note is not null)
);
alter table public.photo_purges enable row level security;
revoke all on public.photo_purges from anon, authenticated;

alter table public.groups add column photo_purged_at timestamptz;
comment on column public.groups.photo_purged_at is
  '#491: when the removed photo''s storage object was deleted for good. photo_url is null from then on.';
