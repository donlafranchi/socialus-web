-- #913 — the Page puts an undated post past its window under Earlier. It reads the same rule Explore does
-- (post_current_until, #314) as a computed field, so `select('current_until')` works through PostgREST and the
-- rule stays in one place. RLS on page_posts still decides which rows a reader gets.

create or replace function public.current_until(public.page_posts)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select public.post_current_until($1.created_at, $1.starts_at, $1.ends_at, $1.show_until);
$$;

comment on function public.current_until(public.page_posts) is
  '#913 — until when this post is current, by post_current_until. A computed field: the Page shows an undated post past it under Earlier.';

grant execute on function public.current_until(public.page_posts) to anon, authenticated;
