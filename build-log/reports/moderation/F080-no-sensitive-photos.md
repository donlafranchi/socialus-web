# F080: no sensitive content in photos; the uploader confirms, a report hides

category: moderation · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended 2026-10-06) · tickets: #221 (closed, covered all 5 criteria), guard #637 · PRs: #250, #251, #483 (#284 closed, superseded by #483)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. A cell is `yes`, `no` or `unknown`; the note says what exists and what is missing. `area:moderation` is the label on #221 [V]. Gates: launch.

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 5 criteria | 3 | 1 | 2 | 3 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: none. Unknown and unguarded: **2, 3** (invariants, no standing guard; filed as #637). Built means the code exists on main [V grep + build log]; shipped means deploy-health was green for the merge commit.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked |
|---|---|---|---|---|---|---|---|---|
| 1 | Uploader confirms each photo shows no children; nothing pre-screens | behavior | yes | `PagePhotoPicker` waits for the tick, clears it after every upload (#483). Page picture and post photo both use it [V]. The tick is client-side only, as ruled. Unclaimed-Page photos are operator-loaded under the system member (`lib/unclaimed/upload.ts`), not a member upload [V]. | yes (`PagePhotoPicker.test.tsx`, marked `F080.5 partial`, not `F080.1`) | yes (#483 reviewer agent) | unknown | no |
| 2 | Text is not in scope; only images are restricted | invariant | unknown | No text or topic rule found in `src` [A, absence]. | no | no | unknown | no |
| 3 | No toggle, setting, tier, request or workaround allows it | invariant | unknown | No flag, tier or request path found [A, absence]. | no | no | unknown | no |
| 4 | A reported sensitive photo hides at once at any bar and texts the operator | behavior | yes | #483: report reason "sensitive content" hides Page picture and post photo past the limits and sends the text; migration `20261007180000_report_category.sql` ran in production [V]. Delivery needs `TWILIO_*` / `OPERATOR_PHONE`; whether they are set in production is unknown. | yes (`report/create.test.ts`, `F080.4 partial`: delivery is Twilio's) | yes (#483 reviewer agent; the PR also carries `review-skipped`) | unknown | no |
| 5 | The app asks not to post sensitive content wherever a member posts, and why; each photo asks for confirmation | behavior | yes | `COPY.postingSafety` via `PostingSafetyNote` on the composers, Page editor and announce; `COPY.photoConfirm` per photo (#250, #251, #483) [V]. Copy is placeholder, awaiting the PM's tone look. | yes (`posting-safety.test.tsx` `F080.5`, `PagePhotoPicker.test.tsx`) | no (#250, #251 have no review section) | unknown | no |

Reviewed: #483 says `Reviewed by: separate reviewer agent (real handlers, a report sent as a member hid the photo)` and is labelled `review-skipped` and `human-review` [V]; #250 and #251 have no review section [V]. Shipped: `Unit tests`, `Lint, types, build`, `Database reachable` success for e737db1 (#250), 399f8fe (#251) and 0b26c0d (#483, plus `Browser` and `Migrations applied to production`) [V]. Smoked: `smoke-live` runs on a schedule, not per commit, and its latest runs failed [V]; no run belongs to an F080 commit. PM looked: no UAT Issue found [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | none | n/a | n/a |
| NO-CHECK | none (1 is marked `F080.5` rather than `F080.1`; re-mark inside #637) | n/a | n/a |
| INVARIANT-UNPROVEN | 2, 3 | `build-ticket` on #637 | a standing guard |
| SPEC-CONFLICT | none | n/a | n/a |
| NOT-REVIEWED | 2, 3, 5 (#250, #251) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all (copy tone for 5 is the PM's [public-is-draft]) | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: #637 (guard criteria 2, 3).

## Next, in order

1. Build the guard #637 (criteria 2, 3; re-mark the criterion 1 test).
2. Confirm `TWILIO_*` / `OPERATOR_PHONE` are set in production, so criterion 4's text arrives.
3. Run `review-pr-bundle` on #250 and #251.
4. Fix the smoke-vs-commit match; then open the UAT Issue, including the PM's look at the placeholder copy.
