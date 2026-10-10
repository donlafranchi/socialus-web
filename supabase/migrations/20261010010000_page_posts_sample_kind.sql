-- #556 — sample posts on unclaimed Pages. A sample post shows a business and a local what a Page
-- looks like with an event, a deal or a last-minute opening on it. It is not a real offer, so the
-- text opens with "Sample" and this column marks it: the loader rolls a stale one forward, and a
-- sample is removed once the Page has a real post. Null on every real post.
alter table public.page_posts
  add column sample_kind text
  check (sample_kind in ('event', 'deal', 'last_minute'));

create index page_posts_sample_idx on public.page_posts (group_id) where sample_kind is not null;

comment on column public.page_posts.sample_kind is
  'Set only on a sample post written by the unclaimed-Pages loader (#556); its body opens with "Sample". Null on real posts.';
