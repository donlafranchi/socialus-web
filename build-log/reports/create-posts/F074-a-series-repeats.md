# F074: a series repeats

category: create-posts (no F074 Issue exists; closest area, picked by the reporter) · as-of: 2026-10-10 · scenario approved 2026-09-20 (gates: none) · tickets: none for F074; related #173 (open, metro timezone), #257 (F091, closed, defers de-duplication to F074), #179 (F072, closed) · PRs: none for F074; related #183, #263, #266
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. A cell is `yes`, `no` or `unknown`. Kinds: **behavior**, **invariant**, **coverage**, **external**.

## Roll-up

| | built | checked |
|---|---|---|
| 8 criteria | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **1-8**, all of them. No F074 PR, build-log file or `[guards F074.n]` marker exists [V grep]. Only the substrate is on main: `page_posts.parent_post_id` (nullable, indexed, `20260916003100_page_post_write.sql`) [V], and `src/lib/metro/metro-time.ts` with a DST-safe wall-time helper but a hard-coded zone constant until #173 lands [V]. F072 is shipped (#183, #263), so single dated posts exist.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Series made once: weekly, chosen weekdays, optional start and end; no other pattern | behavior | no | No composer field or action. Needs new wording (to Don) | no | unknown | no | #592 |
| 2 | Every occurrence is a real `page_posts` row with `parent_post_id`; never computed at read | behavior | no | Column exists, nothing writes it [V grep] | no | unknown | no | #593 |
| 3 | Occurrences from today to three months ahead, at all times | behavior | no | No maintenance job, no schedule [V grep migrations, workflows] | no | unknown | no | #594 |
| 4 | The window job is idempotent | behavior | no | No job; no uniqueness key on (parent, start) | no | unknown | no | #595 |
| 5 | Start computed in the metro's timezone; keeps local time across daylight saving | behavior | no | `metroWallTimeToInstant` is two-pass and DST-aware, but no timezone column exists and no expansion uses it. #173 open. Daylight saving ends 2026-11-01 | no | unknown | no | #597 (depends on #173) |
| 6 | Windowed read: one row per series, one per non-recurring post | behavior | no | `browse_feed` has no distinct or grouping by parent [V migrations]. #266 says it "lands with F074" | no | unknown | no | #600 |
| 7 | Editing one occurrence changes only that one | behavior | no | F072 edits a post in place, but no occurrences exist to prove it on | no | unknown | no | #602 |
| 8 | Each occurrence is its own dated post under F072 (address, window match, responses) | behavior | no | F072 gives a single post these; occurrence rows do not exist | no | unknown | no | #603 |

Reviewed, shipped, smoked: nothing to review or ship for F074; not applicable until a PR exists. Filed: #592, #593, #594, #595, #597, #600, #602, #603. No milestone and no `launch-blocking` (scenario has no `gates:`); #592 carries `needs-pm` (new composer copy).

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 1-8 (#592, #593, #594, #595, #597, #600, #602, #603) | `build-ticket` per Issue (2-4 and 5 share one expansion job; 5 waits on #173; 1 waits on Don's wording) | code + checks |
| NO-CHECK | none yet | after build | marked tests |
| INVARIANT-UNPROVEN | none (no invariant criteria) | none | none |
| SPEC-CONFLICT | none | none | none |
| NOT-REVIEWED / NOT-SMOKED / NOT-LOOKED | all, after build | `review-pr-bundle`, CI, `record-pm-review` | per PR |

## Next, in order
1. #173 (metro timezone column), the only unblocked piece; criterion 5 and the 2026-11-01 daylight-saving change depend on it.
2. Expansion job: #593, #594, #595, #597 together.
3. #600 (de-duplication in `browse_feed`) in the same release as the expansion, or the lens floods.
4. #592 composer once Don approves wording; then #602 and #603 checks.
