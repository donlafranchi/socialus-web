-- #488 — F102 criterion 13: every upload and every post records the address
-- and time it came from, so abuse and legal requests can be traced.
-- Operator-only (RLS on, no policy: the action layer writes, the operator reads
-- over DATABASE_URL), shown to no member, used by no feature outside the report
-- path, and deleted after one year.

create table public.content_origins (
  id          uuid        not null default gen_random_uuid() primary key,
  member_id   uuid        not null references public.members(id) on delete cascade,
  kind        text        not null check (kind in ('post', 'upload')),
  -- The post's id, or the uploaded object's URL.
  ref         text        not null,
  -- Null when the request carried no usable address.
  ip          text        check (ip is null or char_length(ip) <= 45),
  created_at  timestamptz not null default now()
);

create index idx_content_origins_created on public.content_origins (created_at);
create index idx_content_origins_ref on public.content_origins (ref);

alter table public.content_origins enable row level security;
-- No policy, deliberately: see the header.

-- Run daily by .github/workflows/content-origins-purge.yml. Never before a year.
create or replace function public.purge_content_origins(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.content_origins where created_at < p_now - interval '1 year';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_content_origins(timestamptz) from public, anon, authenticated;
