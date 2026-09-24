# F093 · T171 · Signed out sees that an announcement exists, not what it says

> **Renumbered from T170 on 2026-09-24.** `change #216` claimed T170 first — its
> commit landed at 08:03 PDT against this one's 09:25, and its PR (#217) opened
> an hour and twenty minutes before #218. Two tickets with one number is what
> ops-pattern #84 is already open about, so this one moved rather than argue it.
> **The branch name still reads `t170` and cannot be changed** — GitHub does not
> let a PR's head branch be renamed, and closing #218 to re-open it under a new
> name would cost the review and the number for a cosmetic fix. The commit
> message on the first commit also still reads T170; history is not rewritten
> here. `git log --grep F093` is the provenance either way.

**Issue:** #215 · **Scenario:** F093 (`ops-pattern/planning/scenario-F093.md`, approved 2026-09-23)
**Ruling:** `ops-pattern/DECISIONS.md`, 2026-09-23 — Don, on #200
**Carries a migration:** yes — `20260923161500_announcements_withheld.sql`

## What the ruling asked for

> Who exists is public. What's happening is not — but *that* something is happening is public.

Signed out, an announcement is a card carrying the Page name, that the Page
posted an announcement, a count for the current period, and a *Become a
member* ask. The body goes entirely — not just `starts_at` and `location_id` —
because the body is free text and a person writing *we're meeting Thursday at
2pm at the river* has put the when and the where in prose. Enforced in SQL.
Pages stay fully public. A signed-in member sees no change.

## Built

**`page_posts_select_published` gains `to authenticated`.** The `using` clause
is byte-for-byte what it was; the role is the whole change. Written as a role
rather than `auth.uid() is not null` because a role is what PostgREST presents
— an anonymous request arrives as `anon` and is not considered by the policy at
all, rather than considered and failing a test inside it.

**`public.announcements_withheld(...)` — the signed-out read path.**
`security definer`, because its whole job is to answer the caller the policy
above just refused. What makes that safe is the **return type**: no `body`, no
`starts_at`, no location, no `description` in it at all. The guarantee is the
projection, not a filter applied on the way out — there is nothing here for a
later caller to stop applying, and the test asserts the **absence of the keys**
rather than that they came back null.

Scopes: metro/place for signed-out Explore (criterion 7), or one group so an
`#announcement-<id>` link resolves for a stranger (criterion 9).

**The count is over `created_at`, never `starts_at`.** Counting by start time
would let an anonymous caller sweep the period bounds and reconstruct the
distribution of when things happen — the withheld half, rebuilt one integer at
a time.

**Period bounds are arguments, not computed in SQL.** "This week" is a
wall-clock question in the metro's zone, and `METRO_TIME_ZONE` lives in exactly
one file until #173 gives each metro its own. A copy of that zone in SQL is how
the two drift, and it would make this function need changing again the day #173
lands. `src/lib/metro/metro-week.ts` is the one place that knows.

**`WithheldAnnouncementCard`** — four things and no fifth. Deliberately not
`TileCard`: every other browse card carries an image slot and a location slot,
because uniform height needs an always-present slot, and both would be a fifth
and sixth thing here. The whole-card text is asserted as one string, so a line
added later fails even though nobody wrote a test forbidding it.

**`WithheldPagePosts`** — the Page's own list, signed out, so the anchor #212
built lands on something. Without it the Page renders no Announcements section
at all and the fragment scrolls to nothing: the #211 dead end, at a different
door.

**`useAnnouncementAnchor`** — #211's effect lifted out of `PagePosts`. Two
surfaces now render announcements a fragment can name, and two copies of that
effect is how they stop landing the same way.

## On criterion 5 and the F076 differencing ruling

`DECISIONS.md` 2026-09-22 says a truthful live count leaks membership by
differencing. **It does not reach this count, and the reason is worth keeping.**
There, the attacker *supplied* the row — submit an address, watch the number,
learn whether it was already there. Here an anonymous caller cannot write an
announcement at all (ADR-7; there is no anonymous handler), so there is no
before-and-after they control and nothing of theirs to probe for. What the
number moves on is a Page owner posting, which this ruling makes public in the
same breath.

The live hazard was the other one, and it is closed by construction: the count
is over `created_at`, so no sweep of the bounds returns anything about when
things happen.

## What contradicted the scenario

**One existing test asserted the opposite of the ruling.**
`tests/page-post-db.test.ts` carried *"is readable by a stranger, which is what
putting it on a Page means"*, and it asserted exactly that — a stranger
selecting the row and getting it back.

F072's **numbered acceptance is untouched**: criterion 2 asks that an
announcement appear "on its Page and in browse", and it still does, in withheld
form (F093 criterion 7). What the test encoded is F072's **story** sentence —
*"in browse, where a stranger looking for what is on this week finds it"* —
which the 2026-09-23 ruling supersedes.

Amended rather than deleted, and inverted rather than dropped: a post nobody
can find is not a post, so the assertion moved from the table to the withheld
path. **F093 should gain a line naming F072's story sentence**, the way it
already names F059 criterion 2b. That is an `ops-pattern` edit and is not in
this PR.

## Verification

- `tests/announcements-signed-out-rest.test.ts` — **11 tests, and they were
  watched failing first against the pre-migration database**, returning the
  body verbatim to an anonymous PostgREST call with the bundle's publishable
  key. That is criterion 1 discharged the way criterion 12 and
  `[guard-proves-itself]` require: by calling the endpoint, not by reading the
  policy.
- Full suite: **2579 passed**, 1 pre-existing flake —
  `tests/migrations-pending-parse.test.ts` times out under a full parallel run
  and passes alone. That is #213's class exactly (*"by the afternoon one was
  missing a 60000ms budget"*), and #214 raised the budget it is still missing.
  Not caused by this branch and not fixed in it.
- `supabase db reset` — every migration applies from empty, in order.
- `tsc --noEmit` clean; `eslint` 0 errors.
