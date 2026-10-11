# F045: a newcomer filters Explore with a filter icon, kind pills and a bottom sheet

category: explore-map (no Issue carries an `area:` label; closest fit) · as-of: 2026-10-10 · scenario approved, shipped, deleted at sync (criteria recovered from a file, not the repo) · gates: none · tickets: #5 (T114, closed), #6 (T115, closed), change #144 (closed) · PRs: none cite F045; the build log is `build-log/2026-W36.md`. Later work that rewrote it: PR #174 (T156, merge 9dde664f), PR #143 (scope picker, b49ab207)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior**, **invariant**, **coverage**, **external**. Criteria as written in the recovered scenario.

## Roll-up

| | built | checked |
|---|---|---|
| 9 criteria | 2 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built as written: **1, 4, 5, 6** (built in T114/T115 in 2026-W36, then deleted by T156/PR #174 under the 2026-09-12 ruling "zero filter pills outside the filter view, at every viewport width" [V PR #174 body, `ExploreFilterSheet.tsx` header]), **3** (distance, sort and Recurring are gone; category became tags), **7** (kind, distance, sort are no longer in the URL), **8** (filters restore from the URL; scroll restore is open as #54). **Six criteria collide with the ruling and with F092 criterion 1 (no chips or pills): flagged SPEC-CONFLICT, not filed.** Reviewed: #5 and #6 carry no `Reviewed by:` and no PR; the W36 log notes "Neither F044 nor F045 has a review-F###.md" [V build log line 145]. PR #174 and #143 carry `human-review`, no `Reviewed by:` line [V]. Shipped: unknown for T114/T115 (no PR, no merge commit); the later PR #174 merge shows `lint` failing alongside other checks passing, #143 all green [V check-runs].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Kind pills (All, Events, ... Asks) fixed above the bottom nav, All default | behavior | **no** | Built in T114 (`KindFilterPills`, W36 log), deleted in #174; Items and `kind=` are gone [V grep: no pills component in `src/components`]. SPEC-CONFLICT with the 2026-09-12 ruling and F092.1 | no | unknown | no | none (conflict) |
| 2 | No separate market/category/day buttons; filter icon at the right of the sticky search bar | behavior + invariant | yes | `ExploreSearchBar.tsx` has location pill, search, sliders icon, `sticky top-0` [V]. Invariant half is open guard #624 (F092.1) | unmarked: `ExploreSearchBar.test.tsx` | unknown | no | #652 (check); guard: #624 |
| 3 | Tapping the icon opens a sheet: distance 1/5/10/25, schedule any/week/weekend/recurring, category multi-select, sort; Show results; Clear all when set | behavior | **no** | Built: sheet with schedule (any/this week/this weekend), tags multi-select, Show results, Clear all when filters are set, half-height, focus trap [V `ExploreFilterSheet.tsx`]. Missing: distance, sort ("no honest point to measure from"), Recurring (PR #174 deviation 4). SPEC-CONFLICT | unmarked: `ExploreFilterSheet.test.tsx` (asserts the built half and the absence of distance, sort, recurring) | unknown | no | none (conflict) |
| 4 | Tapping the Events pill filters instantly to gatherings; pill selected state | behavior | **no** | No pills, no `item_kind` filter on Browse (results are Pages, not Items). SPEC-CONFLICT | no | unknown | no | none (conflict) |
| 5 | Active secondary filters show as removable chips below the search bar; no chip for kind | behavior | **no** | `ActiveFilterChips` deleted in #174; applying the sheet sets filter state only. SPEC-CONFLICT with F092.1 | no | unknown | no | none (conflict) |
| 6 | Chip row disappears when no chips remain | behavior | **no** | Nothing to disappear: no chip row exists. SPEC-CONFLICT (follows 5) | no | unknown | no | none (conflict) |
| 7 | URL carries all active filters (kind + secondary); the URL restores them | behavior | **no** | Built: `browseQueryString` writes `metro`, `area`, `q`, `category` (tags), `schedule`; `BrowseSurface` seeds filters from `useSearchParams` [V]. Missing: kind, distance, sort are not in the URL; `?sort=`, `?distance=` are ignored on purpose. SPEC-CONFLICT for the missing half | unmarked: `query.test.ts` (round trip), `filters.test.ts`; nothing asserts the page loads them | unknown | no | #652 (check, built half) |
| 8 | Back from an Item page restores filters and scroll | behavior | **no** | Filters: URL state is rewritten with `router.replace`, so back should restore them [A; no test]. Scroll: no restoration code in `BrowseSurface`; "Item page" is now a Page. Open #54 (F059 T157 "Browse keeps its URL and scroll") covers it | no | unknown | no | #54 (open, not filed) |
| 9 | A dot on the filter icon when secondary filters are active | behavior | yes | `filter-active-dot` driven by `hasBrowseFilters` (schedule or tags) and an "— filters applied" aria-label [V]. Distance and sort no longer exist to drive it | unmarked: `ExploreSearchBar.test.tsx` | unknown | no | #652 (check) |

Filed: #652 (one check Issue for 2, 7, 9; `Gates: none`, so no milestone, not launch-blocking, no PM question). Not filed: 1, 3, 4, 5, 6, 7 (missing half) are SPEC-CONFLICT; 8 is already open as #54; criterion 2's guard is open as #624; no `guards F045` marker exists anywhere in the repo [V grep].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 8 (scroll) | `build-ticket` on #54 | code + check |
| NO-CHECK (built, nothing asserts it) | 2, 7 (built half), 9 | `build-ticket` on #652 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 2 (no separate filter buttons) | `build-ticket` on #624 | a standing guard |
| SPEC-CONFLICT | 1, 3 (distance, sort, Recurring), 4, 5, 6, 7 (kind, distance, sort) | `scope-scenario`: retire or rewrite F045 against the 2026-09-12 ruling and F092; `Path: new territory` to the PM as A/B/C | amended scenario |
| NOT-REVIEWED | all (#5, #6 had no review; #174, #143 no `Reviewed by:`) | `review-pr-bundle` | review line |
| NOT-SMOKED | all | CI / smoke coverage ticket (smoke-live defaults to `root,explore` but is not tied to F045) | smoke result |
| NOT-LOOKED | all | `record-pm-review` once the above are clear | closed UAT Issue |

## Next, in order
1. Rule on the scenario: F045 as written describes a surface the 2026-09-12 ruling and F092 replaced; rewrite or retire it so six criteria stop reading as unbuilt. 2. #652 (marked tests for 2, 7, 9) and #624 (guard). 3. #54 for scroll and URL restoration. 4. UAT Issue after the scenario is settled.
