# T162 (Issue #75) — the post table, and browse's post-grain read source

**Scenario:** F059 — a newcomer browses, and finds the neighbourhood (`approved` 2026-09-14).
**Depends on:** nothing. **Blocks:** the posts half of #51 and #53.

Substrate only: the table and its read path. No composer, no rendering.

## Why it existed to be built

Browse finds Pages **and posts** — flat, not only the dated ones and not only
the ones with a place (ruled 2026-09-12). `page_posts` did not exist, so browse
was missing **every** post: an undated *"sourdough is back Thursday"* as much as
next Saturday's market. #51 shipped the Page half and said so in its own
migration comment; this is the other half.

## What shipped

- **`public.page_posts`** — one row per post; a Page has many. That grain is the
  thing that was wrong in the retired model (`discoverable_items` is unique on
  `item_id`, and there are no Items).
  - `group_id` → `groups`, **`on delete cascade`**. A post has no life
    independent of its Page.
  - `body`, the searchable free text.
  - `starts_at`, **nullable** — an undated post is first-class, not degraded.
  - `location_id` → `locations`, **nullable**, **`on delete set null`**. The
    asymmetry with `group_id` is the point: a post *belongs to* its Page and
    merely *refers to* a place, so losing a venue costs a pin, never the post.
  - `lifecycle_state` / `discoverability` / `dissolved_at`, the same vocabulary
    as `groups`.
  - `created_at` / `updated_at` for recency.
- **RLS, SELECT-only.** A reader sees live posts of visible Pages; the Page's
  founder sees their own in any state. No write policy — ADR-7.
- **`public.browse_posts(p_place_id, p_now, p_limit)`** — `stable`, `security
  invoker`, pinned `search_path`, `revoke all` then `grant execute` to
  `anon, authenticated`, with a `comment on function`. Dropped by exact
  signature first so two overloads cannot coexist.
- **`src/lib/feed/browse-posts.ts`** — the typed helper, mirroring
  `browse-pages.ts` and decoding geography with `decodeEwkbPoint`.
- `page_posts` added to the conformance script's protected tables.

## Three judgment calls, all recorded in the SQL

**1. An addressless post scopes to its Page's anchor.** Otherwise a post with
no address of its own falls out of every Place and browse is still missing it —
which is the gap this table exists to close. *Browse is everything*: the default
is inclusion, and an exclusion needs a recorded reason.

**2. It still does not borrow its Page's pin.** `location_geography` projects
the post's **own** address and is null when it has none. A post's address is its
own (model.md). What a map does with an addressless post is #53's call, and the
source does not pre-empt it. Scoping and pinning are deliberately two different
answers.

**3. Past-dated posts drop out here, not in a caller.** F059 acceptance 8, and
the ticket is explicit that withheld things are withheld by the read source
rather than filtered in the client. `starts_at is null` always passes, which is
the clause that keeps *flat* true. `p_now` defaults to `now()` and is
overridable so the rule is testable without waiting for a clock.

## What was deliberately NOT built

- **No `p_category`.** Categories are retired; tags are the only vocabulary
  (ruled 2026-09-13). `browse_pages` still carries the parameter from before
  that ruling and is left alone.
- **No interest-tag boost.** Browse is complete and unranked by member interest
  — that is Home's. Asserted on the call shape and the function source.
- **Nothing derived from payment.** Asserted by word against the DDL.
- **How a mixed Page/post list reads and orders**, and **map pin grouping by
  Page**. Both named in the ticket as out of scope; neither touched.
- `locality_feed_items` and `browse_pages` are untouched.

## Verification

**local Postgres**, migration applied to the local Supabase instance.

- Full suite **1778 passing**, 0 failing (1732 on `main` before; 46 new).
- The behaviour half seeds real Pages and posts in a transaction and rolls back
  — an empty `page_posts` would let every "is withheld" assertion pass while
  checking nothing, which is the shape T150 exists to remove.
- The payment guard was checked by **adding a `promoted_until` column and
  confirming the test fails**, then reverting. Three other tests in this file
  were wrong on first run and were fixed rather than accommodated: the FK
  assertions matched `references public.groups` where `pg_get_constraintdef`
  emits `REFERENCES groups(id)`, and the payment scan read its own explanatory
  prose. The literal-stripping it now does exists because a `comment on` body
  contains a semicolon, so a statement-terminator scan stopped inside the
  string and read the tail as DDL.
- `tsc --noEmit` clean in these files (3 pre-existing errors in
  `migrations-t042.test.ts` remain). `lint` unchanged from baseline.
  `npm run build` passes. `npm run check:action-layer` OK, 36 protected tables.
- **From-scratch apply** is CI's `supabase db reset` job. Not run locally on
  purpose — it would wipe a local stack another session may be using, and the
  PR gates on that job.
