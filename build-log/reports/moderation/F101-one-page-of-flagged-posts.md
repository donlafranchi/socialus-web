# F101: one scannable page of flagged and reviewed Posts, decided in one tap

category: moderation · as-of: 2026-10-10 · scenario approved 2026-10-05 (gates: launch) · tickets: #487 (closed), #304, #380, #398 (open design pass) · PRs: #380, #499, #502, #506, #513, #538
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **coverage** (all of a set), **external**.

## Roll-up

| | built | checked (marked) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 15 criteria | 12 | 2 (3, 15) | 4 (1, 2, 3, 10) | 12 | 0 | 0 |

Not built: **2** (the "under appeal" status), **12** (earlier AI reads missing from the history), **13** (reveal is a tap, not press-and-hold). Unchecked-by-marker: 13 built criteria have tests with no `[guards F101.N]` marker. Built means code on main [V grep, build logs]; reviewed means the PR that built it carries `Reviewed by:` (#499, #506, #513; #380 and #538 carry none); shipped means deploy-health success on ab7691dc, a later main commit than all six PRs [V]. Smoked: latest smoke-live runs on main fail and none is tied to this feature, so 0.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Operator-only Posts page, one row per subject (Post with its photos, Page photo, Page picture); non-operators 404 | behavior + invariant | yes | `page.tsx` gates on `reports.review`, `groupBySubject` rolls reports per subject incl. `page_picture`, `post_photo` [V] | unmarked: `tests/admin-reports-gate.test.ts`, `ReviewQueue.test.tsx` | unknown | no | #636 |
| 2 | Row shows thumbnail, 120-char excerpt, badge, reasons+count, AI read, rebuttal, reporter counters + coordinated flag, status, age | behavior | **no** | All shown except status "under appeal": no appeal state exists anywhere in code [V grep]. Appeals are out of scope in the scenario's "Not this" | unmarked: `ReviewQueue.test.tsx` | unknown | no | none (SPEC-CONFLICT) |
| 3 | Severity 1–4, highest open tier; shadow = reporter's, live = higher of the two | behavior | yes | `review-subjects.ts` tier map, `ai_mode` data flag (#513) [V] | yes (`[guards F101.3]`) | unknown | no | |
| 4 | Order severity then oldest; sort severity/age/count; filter by status; header counts by severity | behavior | yes | Sort has all three; filter is Waiting/All, not hidden/restored/removed individually [V]; header counts by severity [V] | unmarked: `ReviewQueue.test.tsx` | unknown | no | #636 |
| 5 | Approve/Remove full-width, 48 px+, bottom half of row; Approve restores, Remove keeps down | behavior | yes | `min-h-12` buttons in the row footer [V] | unmarked (partial marker covers height only) | unknown | no | #636 |
| 6 | Swipe right approves, left removes, colour and word revealed | behavior | yes | `ReviewQueue.tsx` pointer handlers, green/red reveal [V] | unmarked: `ReviewQueue.test.tsx` (right swipe only) | unknown | no | #636 |
| 7 | One tap or swipe per decision; severity-1 Approve asks once more | behavior | yes | Severity-1 confirm in row [V] | unmarked: `ReviewQueue.test.tsx` | unknown | no | #636 |
| 8 | No confirm dialog; 5-second Undo; undone writes no decision and tells nobody | behavior + invariant | yes | Decision held client-side five seconds before the server call [V] | unmarked: `ReviewQueue.test.tsx` ("Undo ... writes nothing") | unknown | no | #636 |
| 9 | Next waiting row moves into place after each decision | behavior | yes | Row removed from the list on decide [V] | unmarked (50-row keystroke test is partial for 15) | unknown | no | #636 |
| 10 | One-tap default reason: Approve "Nothing wrong with it"; Remove matches top category; changeable in detail | behavior | yes | `DEFAULT_REASON`, category reason codes (#513, migration `20261008005836`) [V] | unmarked: `ReviewQueue.test.tsx` | unknown | no | #636 |
| 11 | A decision writes one `report_decisions` row per open report, attributed, reversible | behavior | yes | `decideReportAction` called per open report id [V] | unmarked: `ReviewQueue.test.tsx` (client call ids, not the database rows) | unknown | no | #636 |
| 12 | Tap row: full history, every report, assessment, rebuttal, decision, newest first, Undo on any decision | behavior | **no** | Reports, decisions with Undo, rebuttal and latest AI read exist. **Every earlier AI read is missing** (build log 486) | unmarked: `ReportEntry.test.tsx` | unknown | no | #634 |
| 13 | Severity 1–3 thumbnails blurred until pressed and held; severity 4 plain | behavior | **no** | Blur by tier exists; **reveal is a tap toggle, not press-and-hold** (`onClick` flips `peek`) [V] | unmarked: `ReviewQueue.test.tsx` (tests the tap) | unknown | no | #635 |
| 14 | Desktop keys: A approves, R removes, J/K move, U undoes | behavior | yes | Key handler in `ReviewQueue.tsx` [V] | unmarked: `ReviewQueue.test.tsx` (R, U tested; A, J, K not) | unknown | no | #636 |
| 15 | 50 rows clearable in under 10 minutes on a phone, browser test at 375 px | coverage | yes | `evals/features/F101-report-decisions-at-375.spec.ts`, 50 decisions in 23.7 s [V PR #538] | yes (`[guards F101.15]`) | unknown | no | |

Filed: #634 (criterion 12), #635 (criterion 13), #636 (check criteria 1, 2, 4–14). All `launch-blocking`, milestone Beta 11-06, none needs Don.

## Evidence

- Reviewed: `Reviewed by:` in #499, #506, #513, #502; absent in #380 (the PR that built 4–11, 14) and #538. #499 also carries `review-skipped` beside its `Reviewed by:` line. #398 (design and accessibility pass) is open.
- Shipped: ab7691dc (#538) deploy-health all success incl. migrations applied to production [V]. Earlier merges: 883b92ea Lint, types, build failed; 966d762f Unit tests failed; 66a346a0 cancelled; later main commits are green.
- Smoked: smoke-live fails on the latest three runs (f28fa72c, e7d4cea1); no result ties to F101.
- PM looked: no `pm-reviewed` or UAT Issue for F101.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 12 (#634), 13 (#635) | `build-ticket` | code + check |
| NO-CHECK | 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 | `build-ticket` on #636 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | none (1 and 8 are covered by #636) | | |
| SPEC-CONFLICT | 2 ("under appeal" has nothing behind it; appeals are out of scope) | `scope-scenario` | PM ruling or scenario amendment |
| NOT-REVIEWED | 4–11, 14 (#380 has no `Reviewed by:`) | `review-pr-bundle` | review line |
| NOT-SMOKED | all | CI: fix smoke-live, cover `/admin/reports` | smoke result |
| NOT-LOOKED | all | `record-pm-review` once the above are clear | UAT Issue |

## Next, in order
1. #635 and #634 (the two unbuilt criteria). 2. #636 (marked tests for the rest). 3. `scope-scenario` on criterion 2's appeal status. 4. Review #380's work, fix smoke-live. 5. UAT Issue.
