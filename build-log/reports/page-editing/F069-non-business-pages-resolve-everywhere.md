# F069: a non-business Page resolves everywhere, and holding several is ordinary

category: page-editing · as-of: 2026-10-10 · scenario building (dated 2026-09-10, `depends: F060`, no `gates:`) · tickets: #22 (T134, open), #24 (T136, open), check chore #591 · PRs: #174 (T156, the shared Page resolver fix), none cite F069
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. A cell is `yes`, `no` or `unknown`. Area: no Issue carries an `area:` label; `page-editing` is the closest of the list [A].

## Roll-up

| | built | checked |
|---|---|---|
| 4 criteria | 2 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a `[guards F###.N]` marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **2 (products and services; the gatherings half is built), 4** (open tickets #22, #24). Both tickets are still open although part of #22 shipped under another number, so closed-ness is no signal here. No PR, build-log line or test marker names F069 [V grep].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked |
|---|---|---|---|---|---|---|---|---|
| 1 | A non-business Page's URL renders instead of 404ing | behavior | yes | `resolveShop` has no kind filter (comment "CORRECTED 2026-09-19 (T156)"); `kinds` is an opt-in narrowing [V `resolve-shop.ts`]. PR #174. | unmarked: `resolve-shop.test.ts` ("T156 — resolveShop takes the Page kind as a parameter"). Check #591. | yes (#174 body: M2 code-review run) | unknown | no |
| 2 | Products, services, gatherings under a non-business Page resolve | coverage | **no** | Gatherings: built, `resolve-gathering.ts` has no business filter. **Products and services: missing.** `resolve-product.ts:116` and `resolve-service.ts:98` still `.eq('kind', 'business')` on the owning Group [V]. Venue lookup `resolve-venue-items.ts:32` too. Ticket #22. | no (gathering half unmarked; no non-business case found in `resolve-gathering.test.ts`). Check #591. | no | unknown | no |
| 3 | A Member with several Pages sees every one on a producer surface | behavior | yes | `OwnPages` on /you lists every Page the member founded, drafts included [V `src/lib/member/own-pages.ts`, `src/app/you/page.tsx:62`]. Producer pages beyond /you were not audited [A]. | unmarked: `own-pages.test.ts`. Check #591. | unknown | unknown | no |
| 4 | Draft-resume keeps every in-flight draft | behavior | **no** | `getDraftGroup` still takes `.order(created_at desc).limit(1)` and its comment calls multiple drafts "pathological" (`src/lib/sell/getDraftGroup.ts:109-121`) [V]. Ticket #24. | no | no | unknown | no |

Reviewed: #174 has an M2 code-review line; the lane for `OwnPages` is unknown [V PR body]. Shipped: #174 merge commit 9dde664f has a mix of check results (Unit tests and Lint/types/build success; three `lint` entries failed) so shipped is unknown [V]. Smoked: `smoke-live` is scheduled, not per commit, so no run belongs to any F069 commit.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 2 (products, services, venue lookup), 4 | `build-ticket` on #22, #24 | code + checks |
| NO-CHECK (built, nothing asserts it) | 1, 3, and 2's gathering half | `write-tickets` then `build-ticket`: #591 | marked tests |
| INVARIANT-UNPROVEN | none (no invariant criteria) | none | none |
| NOT-REVIEWED | 2, 4, and 3 unknown | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: #591 (check criteria 1, 2, 3; `chore`, `area:page-editing`; no milestone, scenario has no `gates:`). Criteria 2 and 4 already have open Issues #22 and #24, so nothing new was filed for them.

## Next, in order

1. Build #22 for products, services and the venue lookup (the pattern is `resolve-gathering.ts`), then #24 for every open draft.
2. #591: mark the existing tests and add the missing gathering case.
3. Run `review-pr-bundle` on the two builds; fix smoke-vs-commit; then a UAT Issue.
