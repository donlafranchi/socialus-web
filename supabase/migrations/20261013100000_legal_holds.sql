-- #648 — F102 criterion 14: apparent child-safety content is preserved, not only hidden (18 U.S.C. 2258A: keep
-- reported content, with limited access, for a year after reporting it). Operator-only: RLS on, no policy; the
-- action layer writes and the operator reads over DATABASE_URL. Shown to no member, used by nothing outside the
-- report path. The hold is a snapshot (the words, the photo address, the poster, where it came from) so removing
-- or editing the item cannot erase the evidence; the photo bytes are protected by the purge handler refusing a
-- held photo, and the origin rows by purge_content_origins skipping a held item.

create table public.legal_holds (
  id               uuid        not null default gen_random_uuid() primary key,
  subject_kind     text        not null check (subject_kind in ('group', 'post', 'page_picture', 'post_photo')),
  subject_id       uuid        not null,
  group_id         uuid        not null,
  poster_member_id uuid,
  media_url        text,
  body             text,
  origin_ip        text,
  origin_at        timestamptz,
  first_report_id  uuid        references public.reports(id) on delete set null,
  held_at          timestamptz not null default now(),
  -- A year after it is reported; reporting to NCMEC restarts it (set by the record handler, #648 part 2).
  retain_until     timestamptz not null,
  unique (subject_kind, subject_id)
);

alter table public.legal_holds enable row level security;
revoke all on public.legal_holds from anon, authenticated;
-- No policy, deliberately: see the header.

-- The daily origin purge keeps the address and time of anything held.
create or replace function public.purge_content_origins(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.content_origins o
   where o.created_at < p_now - interval '1 year'
     and not exists (
       select 1 from public.legal_holds h
        where h.retain_until > p_now
          and (o.ref = h.subject_id::text or o.ref = h.media_url)
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_content_origins(timestamptz) from public, anon, authenticated;
