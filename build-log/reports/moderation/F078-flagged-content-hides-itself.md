# F078: flagged content hides itself, and the poster is told why

category: moderation · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended to 2026-09-30) · tickets: #220 (open umbrella); filed today #625 #626 #627 #628 #629 · PRs: #494, #499, #506, #513, #483 (F080 sensitive reports), #502; F102 answers (#488 lane)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **external** (a third party).

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 11 criteria | 8 | 3 | 0 | 8 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **1** (Page words, listings), **2** (agent score drives hiding), **11** (Don's wording; all strings are placeholders). Spec-conflict: **3** (sensitive-content reports never go to the poster, ruled 2026-10-06). Built means code seen on main [V]; reviewed means the merged PRs carry `Reviewed by:` (#494, #499, #483 also carry `review-skipped`, so the line is the evidence) [V]; shipped means `Deploy health` success on b7c4ebd and f9c3c7e [V]. Merge 883b92e (#506) had `CI` failure on Lint, types, build, deploy health still success [V]. Smoked: `smoke-live` failed on all three latest runs today and is not tied to these commits [V], so unknown.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Everything a member posts is reportable; a report triggers agent classification | behavior | **no** | Reportable: Page photo, Page picture, announcement, post photo (`reports.subject_kind`, migration 20261007290000). AI reads in shadow mode (#513). **Missing: a Page's own words and listings have no report path** [V] | unmarked: `PagePosts.test.tsx`, `create.test.ts` | unknown | no | #625 |
| 2 | Hides when score is at or above the metro's bar, by the agent | behavior | **no** | `metro_polygons.hide_bar` exists. **No score reaches the bar**: `create.ts` "No classifier yet"; `ai_mode` defaults `shadow` [V]. No effect at bar 0 | partial (`[guards F078.2 partial]`, posts-reportable-db) | unknown | no | #626 |
| 3 | Poster told in-app, never email, with category, reporter's reason and a plain explanation | behavior + invariant | yes | `member_notices` row written in the hide transaction; `YouNotices`. **Sensitive-content reports skip the notice** (DECISIONS 2026-10-06, NCMEC) [V] | partial only | unknown | no | #628 (check), #629 (never email) |
| 4 | Poster submits one explanation; unanswered takedown stays hidden and closes itself | behavior + invariant | yes | `report.answer`, one per hide, 14-day window (F102) [V]. "Only an answer creates work" not asserted | partial only (F102.3, F102.4) | unknown | no | #628, #629 |
| 5 | Threat of harm / children texts Don at once; rest queues in a mobile review view | behavior + external | yes | `operator-sms.ts` via Twilio after commit; review page (#380). Whether `TWILIO_*` / `OPERATOR_PHONE` are set in production: unknown | unmarked: `operator-sms.test.ts`, `ReviewQueue.test.tsx` | unknown | no | #628 |
| 6 | Below the bar nothing automatic; lands in the same queue; at launch nothing is below | behavior | yes | A report is always stored and queued; hide gated on `reachesBar` [V] | partial (`create.test.ts`) | unknown | no | #628 |
| 7 | Bar is per-metro data, no migration or deploy; starts at 0; unresolvable metro uses 0 | behavior | yes | `BAR_OF_LOCATION` coalesces to 0, min() on overlap [V] | partial (create.test.ts, member-notices-db) | unknown | no | #628 |
| 8 | Children / threat-of-harm hide at any bar | invariant | yes | `URGENT_CATEGORIES` bypass bar, limits and strikes [V] | yes (`create.test.ts` `[guards F078.8]`) | unknown | no | none |
| 9 | No report without a reporter-chosen reason | invariant | yes | Handler and sheet both refuse [V] | yes (`create.test.ts`, `ReportControl.test.tsx`) | unknown | no | none |
| 10 | Reporter told before sending: misuse is a strike, three stops hiding | behavior | yes | `COPY` line on the sheet; strikes counted at report time (#488 lane) [V] | yes (`create.test.ts` `[guards F078.10]`) | unknown | no | none |
| 11 | Every string kind and gracious; wording is Don's | invariant | **no** | All strings are placeholders (`copy.ts`, `notices.ts`, `categories.ts`); not worded by Don [V] | no | unknown | no | #627 |

Filed: #625 (launch-blocking), #626 (needs-pm), #627 (needs-pm), #628 (launch-blocking), #629 (launch-blocking); all `area:moderation`, milestone Beta 11-06. Umbrella #220 stays open.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 1 (#625), 2 (#626, Don), 11 (#627, Don) | `write-tickets` then `build-ticket` | code |
| NO-CHECK | 3, 4, 5, 6, 7 (and 1 once built) | `write-tickets` (one check ticket, #628) then `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 3 (never email), 4 (only an answer creates work), 11 | guard ticket #629; 11 waits on Don's wording | standing guards |
| SPEC-CONFLICT | 3 (sensitive content is not sent to the poster vs "poster is notified") | `scope-scenario`: amend criterion 3 to match the 2026-10-06 ruling | amended scenario |
| NOT-SMOKED | all | CI: tie smoke to the merge commit, then cover report, hide, notice | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. #628 and #629 (tests and guards, agents alone). 2. #625 (Page words and listings reportable). 3. Don answers #626 (defer score-driven hiding past launch?) and #627 (the strings). 4. Scenario amendment for criterion 3. 5. Fix smoke-vs-commit, then UAT Issue.
