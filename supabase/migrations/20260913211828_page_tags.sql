-- T159 (#64) — tags are the only vocabulary.
--
-- Ruled 2026-09-13: creators create their own tags and pick no category.
-- The twelve-term category list is retired. `groups.category` is left in
-- place and simply stops being written — dropping it is a separate,
-- reversible cleanup, and nothing reads it once the composer changes.
--
-- Two tables, because a tag is shared and a Page's use of one is not:
-- `tags` is the vocabulary every Page draws on, `page_tags` is what a
-- given Page carries. One table with a text column per Page would make
-- "which tags exist" a distinct-scan and "rename a tag" impossible.
--
-- NOT IN SCOPE: moderation. A public tag is member-contributed content
-- other members see, so rule 1 bars it from production until a
-- report-and-takedown path exists (socialus-web #13). `status` below is
-- the hook that work will use; nothing sets it to anything but 'visible'
-- yet, and this migration must not reach production before #13.

------------------------------------------------------------
-- 1. tags — the shared vocabulary
------------------------------------------------------------

create table public.tags (
  id              uuid primary key default gen_random_uuid(),
  -- What the creator typed, preserved. Displayed as written.
  label           text not null check (length(trim(label)) between 1 and 40),
  -- Lowercased and whitespace-collapsed. The uniqueness key, so "Sour Dough",
  -- "sour dough" and " sour  dough " are one tag rather than three.
  normalized      text not null,
  -- The moderation hook. 'visible' until #13 gives someone the power to
  -- change it; a hidden tag keeps its rows so a takedown is reversible.
  status          text not null default 'visible'
                    check (status in ('visible', 'hidden')),
  created_by      uuid not null references public.members(id),
  created_at      timestamptz not null default now()
);

create unique index uniq_tags_normalized on public.tags (normalized);
create index idx_tags_status on public.tags (status) where status = 'visible';

comment on table public.tags is
  'The shared tag vocabulary (T159). Creators create these by typing; nothing seeds them. `normalized` is the uniqueness key so casing and spacing collapse to one tag. `status` is the moderation hook for socialus-web #13 — a public tag is member-contributed content and rule 1 bars it from production until report-and-takedown exists.';

alter table public.tags enable row level security;

-- Anyone may read a visible tag: they appear on public Pages and are what
-- search matches. A hidden tag is readable by nobody through this policy.
create policy "tags select visible"
  on public.tags for select
  using (status = 'visible');

-- Any signed-in member may create a tag. There is no approval queue, by
-- design — a queue nobody owns is a tagging surface that silently does
-- nothing. Removal after the fact is #13's job.
create policy "tags insert by any member"
  on public.tags for insert
  to authenticated
  with check (created_by = auth.uid());

------------------------------------------------------------
-- 2. page_tags — what a Page carries
------------------------------------------------------------

create table public.page_tags (
  group_id   uuid not null references public.groups(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, tag_id)
);

create index idx_page_tags_tag on public.page_tags (tag_id);

comment on table public.page_tags is
  'Which tags a Page carries (T159). Composite primary key makes a Page tagging the same thing twice a no-op rather than a duplicate row.';

alter table public.page_tags enable row level security;

-- Visible on any Page the reader can already see. `groups` RLS is the gate:
-- a Page the caller cannot read yields no row here either.
create policy "page_tags select with its page"
  on public.page_tags for select
  using (
    exists (select 1 from public.groups g where g.id = group_id)
  );

-- Only the Page's founder attaches or removes its tags.
create policy "page_tags write by founder"
  on public.page_tags for all
  to authenticated
  using (
    exists (
      select 1 from public.groups g
       where g.id = group_id and g.founder_member_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.groups g
       where g.id = group_id and g.founder_member_id = auth.uid()
    )
  );
