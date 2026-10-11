# F102: the poster answers first, report misuse is tracked, and the platform holds steady Tuesday to Thursday

category: moderation · as-of: 2026-10-10 · scenario approved 2026-10-05 (gates: launch) · tickets: #488 (closed umbrella, covered all 14 criteria), filed today #645 #646 #647 #648 #649 #650 · PRs: #506 (shared with F078/F101), #509, #540; AI side #513
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **coverage** (all of a set).

## Roll-up

| | built | checked |
|---|---|---|
| 14 criteria | 9 | 3 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **4** (batch rule), **11** (by severity, Friday), **13** (other write paths), **14** (preserve and report to NCMEC). Spec-conflict: **7** (a cool-down hides nothing vs urgent categories still hide; built to the cautious reading, ruling of 2026-10-08 is in a code comment and the #488 comment, not in DECISIONS). Built means code seen on main [V]; reviewed means the merged PR carries `Reviewed by:` (#506 yes; #509 and #540 say review skipped) [V]; shipped means `Deploy health`/check-runs success on 883b92e (#506, `Lint, types, build` failed there), 3a5ce56 (#509), 67f540e (#540) [V]. Criterion 12 is built but dormant: it acts only when `ai_mode` is `live` and `severity4_restore_cleared` is true, and nothing sets that flag [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked | Filed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Poster told category and reporter's reason; gets one answer | behavior | yes | `member_notices` row on hide, fix or say-wrong (#506) [V] | no: `YouNotices.test` exists, unmarked | yes | unknown | no | #649 |
| 2 | Fix and repost shows again at once; reports stay; no second repost; not for severity 1 | behavior | yes | `page_posts.repost_used`, reports stay on the row (#506) [V] | no: only "no second repost" marked (`post.test`) | yes | unknown | no | #649 |
| 3 | Say it's wrong: Mistaken/Malicious/Misusing + 280-char note; one per hide; to AI and row; stays hidden | behavior | yes | `report_answers` unique per notice; rebuttal passed to `run-assessment` (#506, #513) [V] | no: only "one answer per hide" marked | yes | unknown | no | #649 |
| 4 | Unanswered hide stays hidden, closes at 14 days; batch shows it only if severity 1 | behavior | **no** | Notice closes at 14 days (`ANSWER_WINDOW_DAYS`) [V]. **Batch rule missing:** no filter in `reports-queue.ts`/`review-subjects.ts` hides lapsed severity 2-4 rows | no: partial markers | yes | unknown | no | #645, #649 |
| 5 | Per-reporter counters (filed, upheld, dismissed, open), operator-only, used by nothing else | invariant | yes | Counters in `reports-queue.ts`, shown in `ReportEntry.tsx` (#506) [V]; nothing proves "used by nothing else" | no | yes | unknown | no | #650 |
| 6 | Cap 5, drops to 1 after any dismissal in 30 days | behavior | yes | `CAP_AFTER_A_DISMISSAL = 1` in `create.ts` [V] | yes (`create.test`, `[guards F102.6]`) | yes | unknown | no | - |
| 7 | Two dismissals in 30 days start a 14-day cool-down; stored and queued, hide nothing; three strikes above | behavior | **no** | Cool-down and three strikes built, but urgent categories (sensitive, threat of harm) still hide in a cool-down. Spec says hide nothing: SPEC-CONFLICT | yes (`[guards F102.7]`, tests the built reading) | yes | unknown | no | spec-conflict |
| 8 | 3+ reports on a poster in 24h, 2 from accounts under 7 days: flag, +1 tier in severity | behavior | yes | `coordinatedPosters`, sort tier in `review-subjects.ts`; "Possible coordinated reporting" in `ReviewQueue.tsx` [V] | yes (`[guards F102.8]`) | yes | unknown | no | - |
| 9 | Tue-Thu with no person: sev 2-4 wait; sev 1 stays hidden and texts the PM | behavior | yes | Nothing schedules a person step; urgent hides text the operator in `create.ts` [V] | no | yes | unknown | no | #649 |
| 10 | Threat-of-harm report sheet says call 911 if in danger now | behavior | yes | Line shown on picking Threat of harm (placeholder copy, #627 covers the strings) [V build log] | no | yes | unknown | no | #649 |
| 11 | One Friday summary: waiting by severity, answers, cool-downs | behavior | **no** | One-line "This week: answers, cool-downs" built (`fetchWeekSummary`). **Missing:** waiting rows by severity; shown daily, not Friday | no | yes | unknown | no | #646, #649 |
| 12 | Severity 4 auto-restore, narrow gate, logged, reversible, "Restored by AI" | behavior | yes | `restore-gate.ts`, `ai-restore.ts` (#540); dormant until flag cleared by the PM after the F100 harness [V] | yes (`restore-gate.test`, `ai-restore.test`) | no (#540 skipped) | unknown | no | - |
| 13 | IP and time recorded on every upload and post; operator-only; 1 year then deleted | invariant + coverage | **no** | Photo upload and post recorded; RLS, no policy; `purge_content_origins()` [V]. **Missing:** other write paths (#509 "Not here"); purge workflow waits on `CONTENT_ORIGINS_PURGE_ENABLED`, not set [V] | no: deletion marked partial; RLS test unmarked | no (#509 skipped) | unknown | no | #647, #650 |
| 14 | Child-safety is a legal tier: never restores, never to poster, no AI, preserved and reported to NCMEC | invariant | **no** | No poster notice for sensitive content, severity 1 skipped by the AI, restore gate severity 4 only [V]. **Missing:** preservation and the NCMEC report; plan step 1 (register) open | no: poster side marked partial only | yes | unknown | no | #648, #650 |

Evidence: Reviewed `Reviewed by: separate reviewer agents` on #506 and #513 [V]; #509 and #540 `Review skipped` [V]. Smoked: `smoke-live` failed on the latest three runs today and is not tied to these commits [V]. PM looked: no `uat` Issue found for this feature [V]. Filed today: #645 (4), #646 (11), #647 (13), #648 (14, needs-pm), #649 (check 1, 2, 3, 4, 9, 10, 11), #650 (guard 5, 13, 14). Criterion 7 is not filed (spec-conflict).

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| SPEC-CONFLICT | 7 (cool-down vs urgent categories) | `scope-scenario` (put the 2026-10-08 ruling in DECISIONS or amend the scenario) | one ruling |
| NOT-BUILT | 4, 11, 13, 14 | `build-ticket` on #645, #646, #647, #648 | code + check |
| NO-CHECK | 1, 2, 3, 4, 9, 10, 11 | `build-ticket` on #649 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 5, 13, 14 | `build-ticket` on #650 | standing guards |
| NOT-REVIEWED | 12, 13 | `review-pr-bundle` on #540, #509 | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. Answer #648 (NCMEC registration or manual-form fallback), then build it. 2. Build #645, #646, #647. 3. Rule on criterion 7 (cool-down vs urgent). 4. #649 checks and #650 guards. 5. Review #540 and #509. 6. After the F100 harness clears the severity-4 slice, the PM flips `severity4_restore_cleared`. 7. UAT Issue.
