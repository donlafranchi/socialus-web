# F100: an AI reads every reported item first, and a person makes the call

category: moderation · as-of: 2026-10-10 · scenario approved 2026-10-05 (gates: launch) · tickets: #486 (open, umbrella), related #626 (F078 criterion 2) · PRs: #495, #513, #522
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **coverage** (all of a set), **external** (a third party).

## Roll-up

| | built | checked |
|---|---|---|
| 12 criteria | 8 | 6 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **9** (runs on every prompt change), **10** (real licensed photos, children and adult cases), **11** (the live gate), **12** (the known-image hash check). Built means code on main [V grep] or a build-log line [V]. Reviewed: PR #513 carries `Reviewed by: separate reviewer agent` and a Visibility review [V]; PR #495 `Reviewed by: the builder` (not separate) [V]; PR #522 is `review-skipped` with `needs-fix` [V]. Shipped: CI success on d84ef6dc, f9c3c7e0 and ce986681 (unit, browser, migrations, database reachable) [V]; no `smoke-live` result seen, so smoked is unknown. Whether `ANTHROPIC_API_KEY` is set in production is unknown: with it unset no read happens (`after-report.ts`), and the build log names it as the PM's to-do [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Every report and every poster rebuttal triggers one read, after the report is stored; the report never waits | behavior | yes | `assessAfterReport` via `after()` from `create.ts:466`; rebuttal from `report-actions.ts:72`; Page photo, Page picture, Post words and post photo are read (PRs #495, #513). Builders' reports are skipped by design [V] | unmarked: `create.test.ts:519`, `answer-actions.test.ts` (only partial markers) | unknown | no |
| 2 | Haiku with text and vision, structured: category, severity 1–4, confidence, outcome, reason ≤ 140 | behavior | yes | `assess.ts` (Haiku 4.5, forced tool, zod, reason cut to 140; eight categories incl. child and other) [V] | no (partial marker `assess.test.ts:25`) | unknown | no |
| 3 | Under 0.70 Sonnet gives a second opinion; both stored, second shown | behavior | yes | `ESCALATION_THRESHOLD`; `run-assessment.ts` inserts each read [V] | yes (`assess.test.ts:37`) | unknown | no |
| 4 | Send only content, reporter's reason, rebuttal; no name, handle or email; rules versioned | invariant | yes | Payload built in `assess.ts` from `AssessInput`, photo as bytes; `RULES_VERSION` in the system prompt [V] | yes, weak (asserts no "@" and one id absent; `assess.test.ts:75`) | unknown | no |
| 5 | Each assessment stores model, prompt version, category, severity, confidence, outcome, reason, latency, time; RLS on, no policies | behavior + invariant | yes | `report_assessments` (migration 20261007260000) has every column plus tokens and a skipped reason; RLS on, no policy [V] | unmarked: `tests/report-assessments-db.test.ts` | unknown | no |
| 6 | Shadow mode: an assessment changes nothing (but F102's severity-4 auto-restore) | invariant | yes | Only `report_assessments` written in `runAssessment`; restore step is the ruled exception [V] | yes, one path (`run-assessment.test.ts:91`); queue order and notify not asserted | unknown | no |
| 7 | A person's decision is logged against the AI suggestion | behavior | yes | `report_ai_agreement` view, owner-only [V] | yes (`report-assessments-db.test.ts:97`) | unknown | no |
| 8 | Live mode is a data switch; live raises severity and order; remove, restore, strikes stay a person's | behavior | yes | `moderation_settings.ai_mode`, `fetchAiMode`; higher of the two severities in live (PR #513) [V] | unmarked: `ReviewQueue.test.tsx:390` (marked F101.3); `fetchAiMode` untested | unknown | no |
| 9 | Harness prints recall, false alarms, severity accuracy, latency, cost; runs on every prompt change | behavior | **no** | `npm run moderation:eval` prints all of them [V]; **nothing runs it on a prompt change** (no moderation job in `.github`). #638 | unmarked: `eval-metrics.test.ts`, `eval-run.test.ts` | unknown | no |
| 10 | Builder-built labelled set; licensed photos, licence per photo; children and adult cases handled safely | coverage | **no** | 17 cases, 6 synthetic pictures with licence records, `validateSet` refuses unlicensed or minor or sexual images [V]. **No real stock photo, no children-rule case, no adult case, 8 violating cases.** #639 | yes, for the validator (`eval-cases.test.ts`, 3 markers) | unknown | no |
| 11 | Live needs ≥ 95% recall, 100% severity-1, < 10% false alarms, plus two weeks of shadow the PM read | behavior | **no** | `meetsLiveTargets` exists; nothing ties the flip to it; set too small; no shadow-read place. Scenario Size puts live after beta. #640 | no (partial marker `eval-metrics.test.ts:44`) | unknown | no |
| 12 | Suspected severity-1 never sent to a provider; images hash-checked; row goes to a person with the result | invariant + external | **no** | Skip half built: a `sensitive_content` report gets a skipped row, no call, no image fetch [V]. **Hash check (Cloudflare CSAM tool) not built**; build log says rows go to a person without a hash result. #641 | yes for the skip half (`run-assessment.test.ts:50`); no standing guard that no other path calls the provider (#643) | unknown | no |

Filed: #638 (criterion 9, launch-blocking), #639 (criterion 10, launch-blocking), #640 (criterion 11, needs-pm), #641 (criterion 12, needs-pm), #642 (check 1, 2, 5, 8, launch-blocking), #643 (guard 4, 6, 12, launch-blocking). All `area:moderation`, milestone Beta 11-06 (scenario `gates: launch`). Area label read from #486 [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 9, 10, 11, 12 | `build-ticket` on #638, #639; `needs-pm` first on #640, #641 | code + check |
| NO-CHECK (built, nothing asserts it) | 1, 2, 5, 8 | `write-tickets` then `build-ticket` on #642 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 4, 6, 12 | `build-ticket` on #643 | a standing guard |
| NOT-REVIEWED | PR #522 (review-skipped), PR #495 (builder only) | `review-pr-bundle` | separate reviewer's pass |
| NOT-SMOKED | all | CI: tie smoke to the merge commit; cover the report and review routes | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. #638 and #639 (harness trigger; real licensed test set). 2. #642 check ticket and #643 guard ticket. 3. PM answers #640 and #641 (one question each). 4. Review of PR #522. 5. Smoke coverage, then UAT Issue.
