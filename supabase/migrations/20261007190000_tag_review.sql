-- #287 — tags are moderated after they appear, against a list that marks each
-- one safe, unsafe or needs review (Don, 2026-10-01). A tag shows the moment
-- it is made and starts as needs_review; unsafe also sets status 'hidden', the
-- existing takedown, so its rows stay and the call can be undone.

alter table public.tags
  add column review text not null default 'needs_review'
    check (review in ('safe', 'unsafe', 'needs_review')),
  add column reviewed_by_member_id uuid references public.members(id),
  add column reviewed_at timestamptz;

create index idx_tags_needs_review on public.tags (created_at) where review = 'needs_review';

