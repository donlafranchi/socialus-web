-- F099 (beta slice, #460) — a post may carry one photo of its own.
-- Path: well-worn (Facebook and Instagram posts, Google Business Profile
-- updates and Meetup events each carry a photo).
--
-- Criterion 4: the photo belongs to the post only; nothing here touches
-- groups.photo_url. Criterion 7: hidden and removed state sits beside the URL
-- exactly as the Page photo's does (groups.photo_hidden_at / photo_removed_at /
-- photo_hide_locked_url), so a reported or removed image can be resolved away
-- in SQL and never reach a browser.
--
-- page_posts has no column grants: RLS (select_published, select_own) decides
-- who reads a row, and signed out reads no post at all (F093), so a new column
-- needs no grant and opens nothing to anon.

alter table public.page_posts
  add column photo_url             text,
  add column photo_hidden_at       timestamptz,
  add column photo_removed_at      timestamptz,
  add column photo_hide_locked_url text;

comment on column public.page_posts.photo_url is
  'F099: the post''s own photo, one at most, an object in the media bucket under the poster''s folder. Never the Page''s photo.';
comment on column public.page_posts.photo_hidden_at is
  'F099: non-null means the photo is hidden pending operator review; the post stays up and falls back to the Page picture, then the kind placeholder.';
