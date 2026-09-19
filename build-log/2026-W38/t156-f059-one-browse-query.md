# T156 (Issue #53) — one browse query, server-side, for Explore

**Scenario:** F059 — a newcomer browses, and finds the neighbourhood
(`approved` 2026-09-14, amended and re-approved 2026-09-17).
**Depends on:** nothing. **Blocks:** the lens rows, and everything that reads
Explore's results.

Substrate only. Nothing rendered changes; Explore's surface is the next ticket.

## Why it existed to be built

Explore read `discoverable_items` — the **Item-grain** materialized view — from
the browser, then searched, filtered, sorted and measured distance client-side.
There are no Items (`model.md`, Don 2026-09-10), so the grain was wrong before
the query was.

Two server-side sources at the right grain already existed and had **no
consumer between them**: `browse_pages` (T154) and `browse_posts` (T162). They
were the right grain and the wrong number. Between them they could answer none
of the four questions Browse now has to ask of the same corpus.

## What shipped

- **`public.browse_feed(...)`** — one function, replacing both. `language sql`,
  `stable`, `security invoker`, pinned `search_path`, `revoke all` then
  `grant execute` to `anon, authenticated`, with a `comment on function`.
  Returns Pages and posts in **one discriminated row shape** (`result_kind`).
  - **Scope:** `p_metro_id` **or** `p_place_id`, by id and never by slug —
    Explore scopes to a metro (criterion 6); two `places` rows currently share
    the slug `sacramento` and that resolution belongs upstream. Neither given,
    nothing comes back.
  - **`p_kinds`** — the Page kind, as a parameter. Null is every kind.
  - **`p_audience` / `p_following`** — the personal half.
  - **`p_result_kinds`, `p_tags`, `p_starts_from`, `p_starts_before`,
    `p_created_after`, `p_sort`** — the lens axes.
  - **`p_now`, `p_limit`** — injectable clock, clamped page.
- **`src/lib/feed/browse-feed.ts`** — the typed helper. One round trip: the
  place path is projected inline via `place_url_path`, so `attachGroupPrefixes`
  is no longer needed here. Photos go through `visiblePhotoUrl` (T160).
- **`src/lib/feed/followed-pages.ts`** — `resolveFollowedPageIds`, the
  "get updates from" set.
- **`resolveShop` takes the Page kind as a parameter** and applies none by
  default.
- **`idx_groups_browse_created`** — the newcomers lens's predicate, in index
  form.
- Deleted: `browse-pages.ts`, `browse-posts.ts` and their tests.

## The two things this ticket existed to carry

**1. The follow set is a predicate, not a filter.** *"Signed in, Browse carries
the person's own announcements and upcoming things; signed out, that half is
absent — and absent **server-side**, never rendered and hidden, because a
surface that ships personal content to every reader has already disclosed it"*
(Don, 2026-09-17; F059 criteria 2b/2c).

So `p_audience = 'following'` restricts to `p_following`, and `coalesce` to an
empty array is the load-bearing line: a signed-out reader has no set, an empty
set matches nothing, and the rows never leave Postgres. The predicate is
written `p_audience = 'public'` rather than `<> 'following'` **on purpose** —
a misspelled audience then returns nothing, instead of returning the whole
public feed under a heading that says *from Pages you follow*.

The TypeScript carries the same guard structurally: `BrowseAudience` is a
discriminated union, so `'following'` cannot be asked for without the set.

**2. The Page kind is a parameter everywhere, including `resolveShop`.**
Whether SocialUs has two Page kinds or three is Don's and unruled.
`resolveShop` had `.eq('kind', 'business')` baked in, which 404'd every Page
that is not a business — a run club, an interest Page, a practice. Don hit it
himself with SacRiver Floaters. The filter is now `opts.kinds`, empty by
default: `groups.slug` is globally unique, so a kind predicate there can do
exactly one thing, which is hide a Page that exists.

**Resolving it and rendering it blank is not a fix**, so `displayName` and
`publicDescription` fall back to `groups.name` / `groups.description`. Only a
business keeps those in the `group_businesses` child; nothing else has one.

## Three judgment calls, recorded in the SQL

**1. One function, not two, and the old two are dropped in the same
migration.** Two sources means a caller interleaves two result sets and
re-sorts them — which is the mixed-ordering question #51 and #53 both recorded
as open, answered by accident in a client. One parameterised source also makes
each lens **one call**, which is what turns *"a section hides rather than
showing an empty row"* into `length === 0` rather than a second query per lens.
Neither dropped function had a caller; verified by grep before writing.

**2. A post inherits its owning Page's tags.** There is no `post_tags` table.
Without this, a product-category lens would return Pages and silently never
their posts. Stated in the SQL rather than left to be inferred; if post-level
tags land, it becomes the post's own and the lens does not change shape.

**3. `p_tags` matches `tags.normalized`, the projection returns `tags.label`.**
The lens should not care that a creator typed *"Local Food"*. Normalising is
the helper's job via the existing `normalizeTag` — a second copy of that rule
in SQL is how the two drift.

## What was deliberately NOT built

- **No cost parameter, and no "free things" lens.** It is the fourth lens axis
  (Don, 2026-09-17) and there is no price or cost column anywhere on a Page or
  a post — the only one in the schema is `item_products.price_cents`, on the
  noun the model says does not exist. **Don owes that decision**; a stub
  parameter would read, in every future grep, as built. Asserted absent by
  word, so adding it means deleting a test that says why it is not there.
- **No curated tag list for the product-category lens.** `p_tags` is the
  mechanism; which tags make a lens is Don's to pick, and the lens waits.
- **No community-response ordering.** Permitted by criterion 3, and there is no
  response count on a Page or a post. Recency only.
- **Nothing rendered.** Explore still reads the old Item-grain path; swapping
  the surface onto this one, with the lens rows, is the next ticket.
- **`locality_feed_items` untouched.** Home is paused with its capability
  preserved (Don, 2026-09-17).
- **`src/ontology` untouched.** No new link type — this reads *a Member is
  subscribed to a Page's updates*, already declared.

## Verification

**unit tests + CI's from-scratch database.**

- Full suite **2154 passing** locally; the 12 failures are all
  `cannot run: …` from the eleven DB-bound suites plus this one, which is what
  T150's guard does without a database. Docker is not running on this machine
  and Don is away from it, so the DB half was left to CI's `supabase db reset`
  job, which builds the stack from the migration files in this commit.
- The behaviour half seeds Pages, posts, tags and a follow set in a transaction
  and rolls back — `groups` and `page_posts` are empty on a fresh database, so
  every "is withheld" assertion would otherwise pass while checking nothing.
- The signed-out case is tested three ways against a real database: an empty
  follow set, a null one, and a misspelled audience. All three return zero rows.
- `tsc --noEmit` clean. `lint` clean (warnings unchanged from baseline).
  `npm run build` passes with CI's placeholder env. `check:action-layer` OK,
  38 protected tables.
