# F061: creating a Page asks one question, its kind

category: create-posts (no Issue carries an `area:` label; closest pick) · as-of: 2026-10-10 · scenario building (amended 2026-10-04; criteria 1–3 and 5 of the old scenario moved or retired) · tickets: #28 (T147 six-step composer, open, stale), #301 (closed), follow-ups #575, #576 · PRs: #326, #382
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard).

## Roll-up

| | built | checked |
|---|---|---|
| 3 criteria | 3 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: none. Built means code on main [V grep] and build log `2026-W40/change-301-create.md` [V]; shipped means `Deploy health` and `CI` success on a5eefa3e (#326) [V]. Open #28 still describes the retired six-step composer; the scenario no longer has it, so it is stale, not a gap (left alone).

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Create asks one question, the kind, each a question with a one-line purpose; the screen says this just starts the process | behavior | yes | `WhatAreYouStarting.tsx`: "What are you starting?", four answers, each with a line, and "This just gets things started" [V]. The fourth, "Be creative", is Don's own wording and not a question (#382, ruled 2026-10-05) | unmarked: `WhatAreYouStarting.test.tsx` (questions, lines, nothing public); nothing asserts the "just gets things started" sentence. #575 | unknown | unknown |
| 2 | Creation lands the owner on the draft Page; name, address, neighbourhood, tags are set there | behavior | yes | `startDraftAction` makes a draft of the kind and redirects to the Page [V]; Before-you-publish checklist and Edit on the draft (#326). Address/tags editing is F056 | unmarked: `create/actions.test.ts` ("creates a draft ... and lands on it"); nothing asserts the draft offers name, address, tags. #575 | unknown | unknown |
| 3 | Map/card placement from a single read-time resolver; nothing precomputed or cached | invariant | yes | `resolvePagePlacements` in `resolve-page-placement.ts` (T143), used by `resolveShop`; no placement column or cache found in migrations [V grep] | no: `resolve-page-placement.test.ts` tests shape, not absence of stored placement. #576 | unknown | unknown |

Reviewed: #326 says `Reviewed by: reviewer agent (first pass, 2026-10-04)` [V]; #382 says `Review skipped: Docker Desktop is down` [V] (it only added the fourth answer). Smoked: `smoke-live` runs on a schedule, not per commit; the two latest runs (2026-10-10) failed, on commits not tied to F061 [V]. PM looked: no `uat` Issue found for F061 [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | none | n/a | n/a |
| NO-CHECK (built, nothing asserts it) | 1, 2 | `write-tickets` then `build-ticket` (tests only, seen failing): #575 | marked tests |
| INVARIANT-UNPROVEN | 3 | `write-tickets` then `build-ticket`: #576 | a standing guard |
| NOT-REVIEWED | 1 (the "Be creative" answer, #382) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit; cover `/create` | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: #575 (check criteria 1, 2), #576 (guard criterion 3). Both `Gates: none` (scenario has no `gates:`), so no milestone and no `launch-blocking`; neither needs the PM.

## Next, in order
1. #575 and #576 (tests only). 2. Review #382. 3. Smoke `/create` per commit. 4. UAT Issue.
