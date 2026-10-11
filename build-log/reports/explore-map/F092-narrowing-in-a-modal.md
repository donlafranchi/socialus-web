# F092: narrowing happens in a modal that writes what it did

category: explore-map · as-of: 2026-10-10 · scenario approved 2026-09-19 (depends F091; no `gates:`) · tickets: none cite F092 (filed today: #619-#624) · PRs: none for F092; criterion 1 came from #174 (F059 T156); dependency F091 #266
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **coverage** (all of a set).

## Roll-up

| | built | checked |
|---|---|---|
| 6 criteria | 1 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a `[guards F###.N]` marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **2, 3, 4, 5, 6**. The only part of the feature on main is that the chip and pill rows are gone and a filter sheet opens from the search row [V code]. Applying the sheet sets filter state; it never writes text into the box [V `ExploreFilterSheet.tsx`, `BrowseSurface.tsx`]. No PR cites F092. #174 carries `human-review` and no `Reviewed by:` line; its merge commit 9dde664f shows `lint` failure alongside other checks passing [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Only the panel-opening control on the results surface; no chips or pills | invariant | yes | `ActiveFilterChips`, `KindFilterPills` deleted in #174; BrowseSurface renders the search row with one filter-open control [V]. No guard asserts it | no | unknown | no | #624 (guard) |
| 2 | Apply closes the panel and writes the selection into the box as readable, retypable text | behavior | **no** | Sheet closes and sets `filters` state (schedule, tags). Nothing writes text to the box | no | unknown | no | #619 (needs-pm: wording) |
| 3 | Results match the box text, panel-written or typed | behavior | **no** | `searchBrowseResults` does free-text substring match only; filters come from separate state. Box text is not the state | no | unknown | no | #620 |
| 4 | Every string the panel can write is understood by the box reader | coverage | **no** | No grammar or parser exists; needs a round-trip over every panel selection | no | unknown | no | #621 (needs-pm: wording) |
| 5 | Text not understood opens the panel; never errors, never silently empties | behavior | **no** | Free text never errors, but unparsed text does not open the panel; empty state reads "Nothing here yet — try another filter". Replaces #57's chips fallback | no | unknown | no | #622 |
| 6 | Clearing the box clears the narrowing | behavior | **no** | Emptying the box clears the query only; sheet filters stay active with nothing visible. `clearAll` exists only behind the sheet's Clear all | no | unknown | no | #623 |

Filed: #619, #620, #621, #622, #623 (NOT-BUILT, scenario, no milestone since `gates:` absent); #624 (guard for criterion 1). Open #57 and #587 overlap and were not touched.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 2, 3, 4, 5, 6 | `write-tickets` / `build-ticket` on #619-#623 (2 and 4 wait on Don's wording) | code + check |
| NO-CHECK (built, nothing asserts it) | none (1 is a built invariant, see below) | n/a | n/a |
| INVARIANT-UNPROVEN | 1 | `build-ticket` on #624 | a standing guard |
| NOT-REVIEWED | 1 (#174 has no `Reviewed by:`) | `review-pr-bundle` | review line |
| NOT-SMOKED | all | CI / smoke coverage ticket | smoke result |
| NOT-LOOKED | all | `record-pm-review` once the above are clear | closed UAT Issue |

## Next, in order
1. Don: approve the words the panel writes (#619, #621). 2. Build the grammar and writer together (#619, #621), then #620, #622, #623. 3. Guard #624. 4. UAT Issue after 2-6 ship.
