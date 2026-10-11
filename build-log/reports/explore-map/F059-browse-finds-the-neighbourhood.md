# F059: Browse, where a newcomer finds the neighbourhood

category: explore-map · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended to 2026-10-01; no `gates:` field) · tickets: #54 (open), #51, #53, #23 (open, shipped work), #75, #203, #278, #334 (closed) · PRs: #496, #479, #279, #204, #174, #161, #85, #60, #59, #58
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **coverage**, **external**. Area chosen from the label on #57, #334 and PRs #479, #496.

## Roll-up

| | built | checked (marked) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 12 criteria (1, 2, 2b, 2c, 3-10) | 9 | 0 (5 has a partial marker; 7 more have unmarked tests) | 0 | 2 (5, 7) | 0 | 0 |

Not built: **4** (curated lenses beyond "what's happening"), **6** (a metro is still picked for a visitor with none). Unknown: **2** (completeness: `BROWSE_LIMIT = 100`, no paging seen). Reviewed means a `Reviewed by:` line on the PR: #496 and #479 are `review-skipped`, #279 and #161 say "Don doesn't need to look", #204 and #174 carry nothing [V]. Shipped means deploy-health success on the merge commit: 0cee585a (#496) and 3c490272 (#479) pass [V]; the other merge commits show lint only or nothing [V]. Smoked: `smoke-live` failed on main in all three most recent runs today and is not tied to a merge commit [V]. No UAT Issue and no `pm-reviewed` label on any F059 Issue [V].

Stale open Issues: #51, #53 and #54-minus-scroll-key describe work that merged (#60, #174, #161); #23 is an F060 bundle. Left untouched.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Browse is its own surface at `/explore`, own tab; not merged with Home | behavior | yes | Nav tab Explore, `/` redirects to `/explore` [V `page.tsx`, `BottomNav.tsx`] | unmarked: `BottomNav.test.tsx` | unknown | no |
| 2 | Pages and posts together, complete, nothing withheld that the reader may see | behavior | unknown | One `browse_feed` call returns both kinds [V]; capped at `BROWSE_LIMIT = 100`, no paging seen, so a metro over 100 rows may hold some back [A]. Check #589 | no (nothing asserts completeness) | unknown | no |
| 2b | Signed in, also own announcements and things coming up; signed out, absent | behavior | yes | `FollowingRow` plus `HappeningRows`; signed out gets withheld cards only (#204, F091, F093) [V `load.ts`] | unmarked: `load.test.ts`, `FollowingRow.test.tsx` | unknown | no |
| 2c | Signed-in half withheld server-side, never rendered and hidden | invariant | yes | Second `getBrowseFeed` call only when signed in; SQL predicate on `p_following`; empty follow set still calls [V `load.ts`, build log] | unmarked: `load.test.ts`, `load-withheld.test.ts` | unknown | no |
| 3 | Order is locality and recency; never payment, size, follower count or what keeps you scrolling | invariant | yes | `browse_feed` orders by locality and recency; `session-shuffle.ts` shuffles only inside recency bands [V]. Nothing guards the never-part. Guard #590 | no | unknown | no |
| 4 | Curated lenses (today, local food, household, art, free); no kind picker; search separate | behavior + invariant | **no** | Built half: "What's happening… today / this week / this weekend" rows (F091); lens parameters exist in `getBrowseFeed` [V]. Missing: local food / household / art lens, newcomers lens ("newly opened here"); free lens blocked on the scenario's open question (no price substrate; recommend tag). #57 proposes chips, which this criterion rules out. Issue #587; guard for "no kind picker" in #590 | no | unknown | no |
| 5 | List and map by width; Map pill under 1024; side by side from 1024; owner-panel switch at 1280-1439; signed out is list only | behavior | yes | #279 and #496 (signed-out list only, Map pill opens sign-up) on main [V build logs]. The owner-panel mode sits behind a prop nothing sets (open question #278). "Nothing inserted between rows" unguarded, #590 | partial marker only (`BrowseSurface.layout.test.tsx:99`); check #589 | unknown | no |
| 6 | Scoped to the active metro; a member outside every seeded metro chooses, none is picked for them | behavior | **no** | Built half: results scoped to the metro; picker lists every seeded metro; pill says "Choose your area" when unchosen [V]. Missing: `resolveFeedMetro` falls back to Sacramento, so a metro is picked for them (its own comment: "known limitation of a one-metro launch"). Issue #588 (needs-pm) | no (`scope.test.ts` asserts the fallback) | unknown | no |
| 7 | Metro switcher moves a signed-in member's results too | behavior | yes | Requested slug beats the member's stored metro; the pick saves as their default (#479) [V `scope.ts`, `actions.test.ts`] | unmarked: `actions.test.ts`, `scope.test.ts` | unknown | no |
| 8 | Past-dated posts drop out on their own | behavior | yes | `browse_feed` drops `starts_at < now()`, undated never drop [V migration] | unmarked: `tests/migrations-browse-feed.test.ts:671` | unknown | no |
| 9 | Each result carries the name its people are known by; a concealing brand label fails | behavior | yes | Page's name on both Pages and posts [V `BrowseResultCard.tsx`, `card.ts`]. Concealment is a Page-content question, not checked here [A] | unmarked: `BrowseResultCard.test.tsx` | unknown | no |
| 10 | Shared link reopens same metro and search; back restores scroll | behavior | yes | `?metro=`, `?q=`, `?category=` round-trip (`query.ts`); scroll restored once per mount under the literal key `'explore'`, so a metro switch is not re-keyed. Open #54 covers the key and the re-arm | unmarked: `query.test.ts`, `useScrollRestoration.test.ts` | unknown | no |

**Filed:** criterion 4 #587; criterion 6 #588 (needs-pm); check criteria 1, 2, 2b, 2c, 5, 7, 8, 9, 10 #589; guard criteria 3, 4, 5 #590. Scenario has no `gates:` field, so none is launch-blocking or milestoned (unplanned).

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (#587), 6 (#588, needs the PM) | `build-ticket` (6 after the PM answers) | code + check |
| NO-CHECK (built, nothing asserts it) | 1, 2, 2b, 2c, 5, 7, 8, 9, 10 (#589) | `build-ticket` (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | 3, 4 (no kind picker), 5 (nothing between rows) (#590) | `build-ticket` (guard ticket) | a standing guard |
| SPEC-CONFLICT | none; 6 as written contradicts the one-metro launch default, held as the question in #588 | `scope-scenario` if the PM picks A | amended criterion |
| NOT-REVIEWED | all (#204, #174, #161, #279, #496, #479 lack a reviewer line) | `review-pr-bundle` | reviewer lines |
| NOT-SMOKED | all | CI: tie smoke to the merge commit (smoke-live red on main today) | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are clear | closed UAT Issue |

## Next, in order
1. #588 (PM answers the no-metro question). 2. #587 (lenses; free lens waits on the scenario's open question). 3. #589 and #590 (checks and guards). 4. #54 (scroll key). 5. Smoke fix, then UAT Issue.
