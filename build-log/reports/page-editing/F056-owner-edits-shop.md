# F056: a producer edits a shop that already exists

category: page-editing · as-of: 2026-10-10 · scenario approved 2026-09-07, amended 2026-10-01/04/05 (no `gates:`) · tickets: #16 (open, T126, stale: "nothing was built"), filed today #584, #585, #586 · PRs: none cite F056; built under change Issues #293 (PR #305), #285 (#288), #302 (#360), #348 (#351), #413 (#441), #440 (#468), #452 (#472)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. A cell is `yes`, `no` or `unknown`; the note says what exists and what is missing. `area:` is not on #16, so `page-editing` is the closest area.

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 9 criteria | 5 | 0 | 2 | 0 | 1 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **1 (values line; image, name and about are built), 3, 4** (#16 covers the values line; #584 tagline). Unknown: **5**. Criteria 1 (values part) and 3 collide with the 2026-10-06 ruling that values and badges are cut from beta (DECISIONS, #465: "Values & badges" card "Coming soon", nothing on the public Page): SPEC-CONFLICT. Most of the work shipped under unrelated "change" Issues with `Scenario: none`, so no PR or marker names F056 [V grep: no `guards F056`].

## Per criterion

| # | Kind | In plain words | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked |
|---|---|---|---|---|---|---|---|---|
| 1 | behavior | Edit image, name, about and a values line from one prefilled page | **no** | Image, name, description edit on Edit Page in section sheets (`PageEditor.tsx`, #302/#452) [V]. **Values line: missing**, no column or field [V grep]. SPEC-CONFLICT with the 2026-10-06 cut. Open #16. | no | no | unknown | no |
| 2 | invariant | Only an active owner saves; named handler plus event row | yes | `group.update` checks the managing role (owner for a business) and writes `group.updated` [V `update.ts`]. Archived Pages also edit. | unmarked: `update.test.ts` | unknown | unknown | no |
| 3 | invariant | Values column has no source/provenance field | **no** | The column does not exist, so there is nothing to guard. SPEC-CONFLICT as in 1. Guard to ride on #586 once built. | no | no | unknown | no |
| 4 | behavior | ≤120-char tagline, on card, profile and link preview | **no** | No `tagline` column or field [V grep]; only gallery fixtures use the word. Filed #584. | no | no | unknown | no |
| 5 | behavior | Every optional field empty still renders, no nagging | unknown | No test or read of the empty case found. The Edit page carries a "Coming soon" card (#465) [V]. | no | no | unknown | no |
| 6 | behavior | Address resolves to coordinates with a confirming pin; unresolvable refuses | yes | Mapbox/Census geocode, draggable pin (#348 PR #351, #413 PR #441); empty result shows an alert and no confirmed state [V]. Edit serves drafts too (#301). | unmarked: `LocationPlaceFields.test.tsx` | yes (#351, #441) | unknown | no |
| 7 | invariant | Neighbourhood option from a seeded MSA 40900 list; no street address anywhere; pin at centre | yes | List and centroid pin built (#347, #351); #440 (PR #468) stopped an address point being saved. **"Anywhere" has no standing guard.** Coverage of 40900 rests on boundary loader [A]. Filed #586. | unmarked: `where-save.test.ts` | yes (#351, #468) | unknown | no |
| 8 | behavior | Tags in own words, editable any time, at least one to publish, no category | yes | `group.update` replaces tags, refuses empty; `group.activate` requires one (#285 PR #288) [V]. | unmarked: `update.test.ts` | no (#288 no review line) | unknown | no |
| 9 | invariant | Optional public business phone; signed-in only, not the front door | yes | Phone field in Edit Contact; hours hidden by `SHOW_OPENING_HOURS = false` (PR #305, ruled 2026-10-05) [V]. DB tests run as anon and authenticated. | unmarked: `page-contact-db.test.ts` (marks F093.8) | no (#305 no review line) | unknown | no |

Reviewed: #351, #441, #468 carry `Reviewed by:` [V PR bodies]; #305, #288, #360 have none. Shipped: checks on merge commits 34925899 (#351), d41939a1 (#468), e79a69d2 (#441), 7381f602 (#305) were green [V]; a5ab3a1f (#288) shows "Migrations applied to production" failed, so criterion 8 is not marked shipped [V]. Smoked: `smoke-live` is nightly and not tied to a commit. PM looked: no `uat` Issue for F056 found.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| SPEC-CONFLICT | 1 (values line), 3 | `scope-scenario`; `Path: new territory`, to the PM as A/B/C. Question: the scenario wants a values line on the shop, but the 2026-10-06 ruling cuts values from beta. Build it, defer it, or amend the scenario? Open #16 | ruling |
| NOT-BUILT | 4 (#584); 1 and 3 wait on the ruling (#16) | `build-ticket` | code + checks |
| NO-CHECK | 2, 6, 7, 8, 9 (#585) | `build-ticket` (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | 7 (#586); 3 once built | `build-ticket` (guard over the surfaces) | a standing guard |
| NOT-REVIEWED | 2, 8, 9 | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are clear | closed UAT Issue |

Filed today: #584 (criterion 4), #585 (check 2, 6, 7, 8, 9), #586 (guard 7). Gates: none, so no milestone and no `launch-blocking`. Criterion 5 not filed (unknown, not clearly a gap).

## Next, in order

1. Rule on the values line (criteria 1, 3) against the beta cut; close or rewrite stale #16.
2. Build #584 (tagline), then the guard #586 and the checks #585.
3. Read or test criterion 5 (an empty shop), then run `review-pr-bundle` on #305 and #288.
4. Open the UAT Issue once the rows above are clear.
