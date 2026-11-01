-- plan #218 (Don, 2026-11-01) — a Proposal's goal number is optional. A post is a Proposal by its kind
-- (internally 'wonder'); with no threshold its view carries the count and threshold null, and the card
-- shows who's in with no bar. Only Proposals carry a threshold or sizes.
alter table public.page_posts
  drop constraint page_posts_wonder_shape,
  add constraint page_posts_wonder_shape check (
    kind = 'wonder' or (wonder_threshold is null and wonder_options is null)
  );

comment on column public.page_posts.wonder_threshold is
  'F117 — a Proposal''s optional goal: how many people would make it happen. Null: no goal, a count with no bar.';
