# F060: someone starts something without opening a shop

category: create-posts · as-of: 2026-10-10 · scenario building (dated 2026-09-10; criteria amended 2026-09-14, 2026-09-30; no `gates:`) · tickets: #25 (open, stale stub "T139 /you/create entry point"), #301, #336, #363, #55 (T158) · PRs: #326, #392, #364, #58 · area label taken from #110 (no F060 Issue carries one)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing).

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 5 criteria | 4 | 0 | 3 | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **5** (#579). Spec-conflict: **2 and 5** (the scenario says `/you/create`; the route that shipped is `/create`; 2's answer wording is a self-classification question). Built means code on main [V grep]; reviewed means PR #326 carries `Reviewed by: reviewer agent (first pass)` [V]; shipped means `Deploy health` success on a5eefa3 (#326) [V]. Merge #392 (cd96574) shows `CI` failure and no deploy-health row [V]; PR #58 (f79dd46) has no runs listed [A].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked | Filed |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A Member with no Page can create a hosted gathering: no business record, no document/ID/ZIP check; F082 agreement is the only thing before publish | behavior + invariant | yes | `startDraftAction` → `group.create` makes a draft from the kind alone; `group_businesses` row only for kind business; `group.activate` needs name, place, description and the F082 agreement [V]. Nothing guards "no check" | unmarked: `src/app/create/actions.test.ts` | yes (#326) | unknown | no | #580, #581 |
| 2 | First question is what they're starting; no self-classification anywhere | invariant | yes | `/create` heading "What are you starting?", four radios [V]. But the answers read "Have a business where you sell…?", "Do you manage a group…?" (Don's wording, 2026-10-04/05): scenario says "no self-classification". Route is `/create`, not `/you/create` | unmarked: `WhatAreYouStarting.test.tsx` | yes (#326) | unknown | no | #580, #581 |
| 3 | No legal/tax language or legal-entity questions at Page creation | invariant | yes | No such words in Create, draft checklist or rules text [V grep]; no field asks for entity info. Nothing guards it for Create (F082's rules text has its own test) | no | yes (#326) | unknown | no | #581 |
| 4 | Second Page is one tap from the end of the first; first unchanged | behavior | yes | Create is in the bottom nav on every screen (T158, #55) and "Start something" on /you; `group.create` only inserts a new draft [V]. No test of the one-tap path from a Page or of the first staying unchanged; deploy of #58 unconfirmed | no | unknown | unknown | no | #580 |
| 5 | `/you/sell` redirects to `/you/create` preserving the query string | behavior | **no** | `/you/sell/page.tsx` does `redirect('/create')` (#336, #392): target path differs and the query string is dropped. The venue "host here" link used `?compose=gathering&location=…`, now sent to bare `/create`. No test of the redirect. #392 was `review-skipped` | no | no | unknown | no | #579 |

Filed: #579 (criterion 5, scenario), #580 (check 1, 2, 4), #581 (guard 1, 2, 3). All `Gates: none`, no milestone, none `launch-blocking`. #25 is the old open entry-point ticket; its body is a stub, so it was not treated as covering criterion 5.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 5 | `build-ticket` on #579 | code + check |
| NO-CHECK (built, nothing marked asserts it) | 1, 2, 4 | `build-ticket` on #580 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 1 (no-check half), 2, 3 | `build-ticket` on #581 | a standing guard |
| SPEC-CONFLICT | 2, 5 (`/you/create` vs `/create`; "Have a business…" answer wording) | `scope-scenario` to amend the paths and settle whether the answer wording counts as self-classification | amended scenario |
| NOT-REVIEWED | 4, 5 (#392 skipped; #58 none) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. #579 (redirect keeps the query). 2. #580 and #581. 3. `scope-scenario` to fix `/you/create` → `/create` and rule on criterion 2's answer wording. 4. Close or rewrite stale #25. 5. Review #392 and #58; UAT Issue.
