# F058: a member reports something, and the operator can take a photo down

category: moderation (no Issue carries an `area:` label; closest pick) · as-of: 2026-10-10 · scenario approved 2026-09-07 (criteria 4 and 6 amended 2026-09-17), gates: launch · tickets: #12, #13, #61, #62 (all closed), follow-ups #577, #578 · PRs: #65, #81, #82, #151, #152, #508 (purge, later)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior**, **invariant**, **coverage**, **external**.

## Roll-up

| | built | checked |
|---|---|---|
| 6 criteria | 4 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **4** (the map still serves a removed photo, #577). Spec conflict: **2** (later work tells the owner). Built means code on main [V]. Checked: no `guards F058` marker exists on main [V grep]; tests exist unmarked. Reviewed: PRs #65, #81, #82, #151, #152 carry no `Reviewed by:` (they predate the 2026-10-05 rule) and #508 says `review-skipped` [V]. Shipped: deploy checks green on 311a373 (#151) and 1c1b0c9 (#152) [V]; #65 shows failing `lint` runs [V]. Smoked: `smoke-live` is failing on main today and is not tied to a merge commit, so unknown.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | A signed-in member sends a free-text report from an item or shop page | behavior | yes | `ReportControl` on `ShopPublicPage` and `PagePosts`; `report.create` (#81, #82); signed-out gets a sign-in link [V] | unmarked: `ReportControl.test.tsx`, `report-actions.test.ts` | unknown | no |
| 2 | A report changes nothing visible to anyone, including the reported party | invariant | no | SPEC-CONFLICT. The reporter is never named to the owner (`report-privacy-db.test.ts`, seen failing both ways). But a report now hides the photo at once and the owner sees a notice (T160 #62, F078 #220 "poster is told why"); `create.test.ts` says F078 criterion 3 "amends F058 acceptance 2". F058 text was never amended [V] | unmarked: `tests/report-privacy-db.test.ts` | unknown | no |
| 3 | Only the operator sees or can invoke Remove; others rejected by the handler | invariant | yes | `report.remove` / `report.reverse` refuse ordinary member, owner, unset operator before touching the DB; `/admin/reports` is 404 to others [V] | unmarked: `review.test.ts`, `ReviewQueue.test.tsx` | unknown | no |
| 4 | Removal stops every surface serving the photo, writes who/when/why, listing survives | behavior | no | `report.remove` sets `photo_removed_at`, keeps URL, writes `report_decisions`; Page, share, Browse honor it. **Map does not:** `useMapPages.ts` reads only `photo_hidden_at`, and removal clears that column, so pins still show a removed photo [V]. Issue #577 | unmarked: `review.test.ts` (decision row, never nulls URL); nothing on the map | unknown | no |
| 5 | The report reaches a place a person reads | behavior + external | yes | Always: `/admin/reports` queue, oldest hidden first. Plus SMS to the operator for urgent categories (`operator-sms.ts`, Twilio) [V]. Ordinary reports are queue-only, which meets "somewhere a person reads" [A] | unmarked: `create.test.ts`, `operator-sms.test.ts`, `reports-queue-builders.test.ts` | unknown | no |
| 6 | Every decision reversible from the item by a new decision; reviewer sees history | behavior | yes | `report_decisions` append-only, `reverses_decision_id`, history on the card, one reversal per decision [V] | unmarked: `review.test.ts` (reversal inserts, never UPDATE/DELETE), `ReportEntry.test.tsx` | unknown | no |

Filed: #577 (criterion 4, launch-blocking) and #578 (check 1, 3, 5, 6, launch-blocking). Criterion 2 is not filed (spec conflict). The purge path (#508, `docs/purge-proposal.md`) is built now; the scenario's note that it is "not built" is stale.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (map) | `build-ticket` on #577 | code + test |
| NO-CHECK | 1, 3, 5, 6 (4 after #577) | `build-ticket` on #578 (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | none (2 and 3 have tests, unmarked) | covered by #578 | marks |
| SPEC-CONFLICT | 2 | `scope-scenario`: amend criterion 2 to say the owner is told and the reporter never is; `Path: new territory`, plus the open question of telling the member the outcome | amended scenario |
| NOT-REVIEWED | all | `review-pr-bundle` | reviewer pass |
| NOT-SMOKED | all | CI: tie smoke to the merge commit; cover report and remove | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are clear | closed UAT Issue |

## Next, in order
1. #577 (map serves removed photos). 2. #578 (mark the tests). 3. Amend criterion 2 via scope-scenario. 4. Smoke and UAT Issue.
