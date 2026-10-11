# F044: newcomer switches between list and map with an inline toggle

category: explore-map (no Issue carries an `area:` label; closest pick) · as-of: 2026-10-10 · scenario shipped, deleted at sync (approved; no `gates:`) · tickets: T116 (#7, closed) · PRs: none for T116 (commit 060ee79 on main); superseded in part by #279 (F059/T187, via #278) and #328 (dock)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard).

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 5 criteria | 2 | 0 | 0 | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built as written: **1, 4, 5** (spec conflict, not a missing build). T116 built the toggle inline in the results [V build log W36]; T187 (#279) then moved it out of the results: under 1024px a fixed floating dock, from 1024px side by side with no toggle, 1024-1439px with the owner panel open a switch docked in the search row [V `BrowseSurface.tsx`, `ExploreDock.tsx`]. F044 "Out of Scope" rejects the floating pill, so the criteria and the shipped surface disagree. Reviewed: T116 landed as a direct commit with no PR; build log says "Neither F044 nor F045 has a review file" [V]. Shipped: no check-runs or workflow runs found for 060ee79 [V], so unknown.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | No fixed full-width List/Map bar; a compact inline `[List] · [Map]` in the results | behavior + invariant | **no** | Segmented bar is gone. But the toggle is no longer in the results: `ExploreDock` is `fixed` bottom-right under 1024px [V]; `ListMapToggle` is docked in the sticky filter bar only at 1024-1439px with the owner panel open [V]. SPEC-CONFLICT with F059 criterion 5 | no (`ListMapToggle.test` asserts only the component's own classes) | unknown | no |
| 2 | Tap Map: same result set as pins, toggle shows map active | behavior | yes | `setView('map')` through the dock pill or docked tab; docked tab carries `aria-selected` [V]. Dock shows the next view's name, not a selected state [V]. Signed out: Map opens sign-up instead (#334 ruling) [V] | unmarked: `BrowseSurface.layout.test.tsx:123,169`, `ListMapToggle.test.tsx`. Filed #644 | unknown | no |
| 3 | Tap List: back to the card list, toggle updates | behavior | yes | Same path, `setView('list')` [V] | unmarked: same files. Filed #644 | unknown | no |
| 4 | Toggle scrolls with content, never fixed or floating, never occludes a card | behavior + invariant | **no** | T116 built it in flow (`<li role="presentation">` after four cards) [V build log]. Now the dock is `fixed` over the results under 1024px [V]. SPEC-CONFLICT with F059 criterion 5. The "not fixed" test covers `ListMapToggle` only, which no longer sits in the results | no (guards the wrong element) | unknown | no |
| 5 | Toggle sits after the first 3-5 cards, centred, 24px above and below | behavior | **no** | Built by T116 (after four cards) [V build log]; no longer rendered in the results at any width [V grep: only `viewSwitch` in the filter bar and `ExploreDock`]. SPEC-CONFLICT with F059 criterion 5 | no | unknown | no |

Edge cases (not counted): `role="tablist"` with two `role="tab"` and `aria-selected` is on the docked toggle [V] and tested (`ListMapToggle.test`); the dock is a plain button group. The crossfade is a 200ms fade-in, not a true crossfade (build log, accepted). No URL change holds (`?view=` removed) [V].

**Filed:** check criteria 2, 3 #644. Criteria 1, 4, 5 are spec conflicts, routed to `scope-scenario` and not filed. No `gates:` field, so nothing is launch-blocking or milestoned (unplanned).

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | none | n/a | n/a |
| SPEC-CONFLICT | 1, 4, 5 vs F059 criterion 5 (#278/#328) | `scope-scenario`: retire or restate F044 to match the dock; Path: new territory if the PM wants the inline toggle back | amended scenario |
| NO-CHECK | 2, 3 (#644) | `build-ticket` (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | none standing (1 and 4 are moot until the conflict is ruled) | after the ruling, a guard for whichever "not fixed / not floating" survives | a standing guard |
| NOT-REVIEWED | T116 (no PR, no review file) | `review-pr-bundle` | review line |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review`, only after the rows above are clear | closed UAT Issue |

## Next, in order
1. Rule the conflict: F044 vs F059 criterion 5 (scope-scenario). 2. #644 (mark the tests for 2 and 3). 3. Guard for any surviving "not fixed" rule. 4. Smoke tied to the merge commit.
