-- F074.1 (#592): a series is created once, weekly on chosen weekdays, with an optional start and end date.
-- This is the definition only. Occurrences are real page_posts rows, made by the maintenance job (#593, #594, #595);
-- until then the first post is the only row. Written by group.post_create; no client reads or writes (RLS on, no policy).

create table public.post_series (
  id          uuid        primary key default gen_random_uuid(),
  group_id    uuid        not null references public.groups(id) on delete cascade,
  created_by  uuid        not null references public.members(id) on delete cascade,
  -- ISO weekdays, Monday 1 to Sunday 7, sorted and distinct. Weekly is the only pattern (F074 § Not this).
  weekdays    smallint[]  not null,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now(),
  constraint post_series_weekdays_valid check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  constraint post_series_end_not_before_start check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index idx_post_series_group on public.post_series (group_id);

alter table public.post_series enable row level security;

alter table public.page_posts
  add column series_id uuid references public.post_series(id) on delete set null;

create index idx_page_posts_series on public.page_posts (series_id) where series_id is not null;

comment on column public.page_posts.series_id is
  'F074: the series this post is an occurrence of. Editing one occurrence changes only that row (F074.7).';
