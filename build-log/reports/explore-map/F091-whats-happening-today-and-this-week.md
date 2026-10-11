# F091: What's happening, today and this week

category: explore-map (no F091 Issue carries an `area:` label; closest area, picked by the reporter) · as-of: 2026-10-10 · scenario approved 2026-09-19 (amended 2026-10-01, gates: none) · tickets: #257 (closed, covered all 7 criteria), follow-ups #612 (check), #602 (open, F074's read side) · PRs: #266
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing).

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 7 criteria | 5 | 3 | 0 | 5 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **6** (one row per series; no series exist, F074 unbuilt; #602). Unknown: **5**. Built means the code is on main [V files]; shipped means `Deploy health` success on 2a0d7f7c (#266) [V]; the `CI` run on that commit failed in the job "Migrations applied to production", a migration job (#266 has no migration), not a test job [V]. Reviewed: #266 has no `Reviewed by:` line and no `review-skipped` [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked | Filed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A row returns only posts starting in its window, soonest first | behavior | yes | `happeningRows` calls `browse_feed` per row with `startsFrom`, `startsBefore`, `sort: 'soonest'`, posts only (`src/app/explore/load.ts`) [V]. The SQL is in `browse_feed` [V] | no: loader test is `[guards F091.1 partial]`, args only; `tests/migrations-browse-feed.test.ts` covers the SQL but is unmarked | no | unknown | no | #612 |
| 2 | Windows in the metro's timezone, bound to the hour | behavior | yes | `happeningWindows`: every row starts now, today ends at metro midnight, week and weekend end Monday 00:00. The zone is the constant `America/Los_Angeles` until #173 (open) gives each metro its own [V] | yes (`happening.test.ts`) | no | unknown | no | |
| 3 | A row with no results is absent | behavior | yes | `HappeningRows` filters empty rows [V] | yes (`HappeningRows.test.tsx`) | no | unknown | no | |
| 4 | The stem is absent when every row is | invariant | yes | `HappeningRows` returns null when no row is present [V] | yes (`HappeningRows.test.tsx`) | no | unknown | no | |
| 5 | The same link reopens the same rows | behavior | unknown | Rows come from the route's metro and area and the clock; nothing found that pins them to a link, and nothing asserts it [A] | no | no | unknown | no | |
| 6 | A series appears at most once in a row | invariant | **no** | `browse_feed` has no grouping by `parent_post_id` [V migrations]; #266 says it "lands with F074". No series exist yet. Ticket #602 (F074 read side, open) | no | no | unknown | no | #602 |
| 7 | Signed out, the today row is one "Sign in to see what's happening" card per Page posting today | behavior | yes | `signedOutToday` reads the withheld path over midnight to midnight "posted today", not "happens today" (Don's ruling); card copy `withheldCta` reads "Sign in…" [V]. The PR body says "Sign up", the code says "Sign in" [V] | yes (`load-withheld.test.ts`, `[guards F091.7 partial]`: the loader; card has its own tests) | no | unknown | no | |

Reviewed: PR #266 body carries no review line [V]. Shipped: `Deploy health` success on 2a0d7f7c [V]. Smoked: `smoke-live` is scheduled, not per commit, and covers no Explore rows route that I found [A]. PM looked: #257 carries `approved`, `scenario`, `launch-blocking`; no `pm-reviewed`, no `uat` Issue [V]. The PR asked Don to look on the preview; nothing records that he did.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 6 | `build-ticket` on #602 (lands with F074 expansion) | code + check |
| NO-CHECK (built, nothing asserts it) | 1 | `write-tickets` then `build-ticket` on #612 | marked test |
| INVARIANT-UNPROVEN | none (4 has a guard; 6 is not built) | | |
| NOT-REVIEWED | all (#266 no review line) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit and cover Explore rows | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: #612 (check criterion 1). Criterion 6 already has open #602; not duplicated. No milestone or `launch-blocking` (scenario has no `gates:`).

## Next, in order

1. #602: de-duplicate series in the windowed read, shipped in the same release as F074's expansion (scenario: never after it).
2. #612: mark and add the check for criterion 1.
3. Decide whether criterion 5 needs a test or a line in the scenario; the reporter could not tell what "the same link" pins.
4. `review-pr-bundle` on #266; fix smoke-vs-commit; then the UAT Issue for criteria 1-4 and 7.
