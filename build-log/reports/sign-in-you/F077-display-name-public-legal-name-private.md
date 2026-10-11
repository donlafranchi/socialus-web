# F077: members see a display name; the legal name stays with the platform

category: sign-in-you · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended same day; criteria 6-8 out of scope for launch 2026-09-30) · tickets: #219 (open umbrella), filed today #608, #609, #610, #611 · PRs: #497 (signup fields), #245 (member ids), #246 (member reads)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **coverage**, **external**. Scenario has no `gates:` line, so Gates: none, no milestone.

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 8 criteria | 1 | 0 | 0 | 1 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **4, 5**; **6, 7, 8** are out of scope until counsel ([V scenario "Out of scope 2026-09-30"]). Unknown: **1 (second half), 2**. Reviewed: the signup PR #497 says `Reviewed by: review-skipped` [V]. Shipped: all `Deploy health` checks success on d5ebc936 [V]. Smoked: `smoke-live` is not tied to commits, so none.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Signup requires a legal name; no account without it | behavior | unknown | Screen requires 2-120 chars (`signup/profile.ts`, `OnboardingFlow`, handler `signup-profile-set`) [V]. But `members.legal_name` is nullable and `src/proxy.ts` only forces /onboarding when phone verification is on, so a signed-in member may skip it [A] | unmarked: `profile.test.ts`, `onboarding/actions.test.ts:85`, `OnboardingFlow.test.tsx` | unknown | no | #610 |
| 2 | Display name shown wherever a peer would see the legal name | behavior | unknown | Display name set at signup; peers cannot read member rows at all (`members_select_self`), no surface shows legal name [V grep]. Not checked that every post/Page/response/profile renders display name [A] | no | unknown | no | none (not a clear gap) |
| 3 | Legal name never on a public/discovery surface or to anonymous | invariant | yes | Only `members_select_self` remains on `members` (migration 20260930180000); no src file but signup and comments mentions `legal_name` [V]. No standing guard | no | unknown | no | #611 |
| 4 | Operator report view shows legal name beside display name | behavior | **no** | Column exists since #497, but `reports-queue.ts` still says "there is no members.legal_name column" and `ReportEntry.tsx:95` shows display name and handle only | no | unknown | no | #608 |
| 5 | Seeded/test members backfilled or flagged | behavior | **no** | Migration adds a nullable column, no backfill, no flag [V] | no | unknown | no | #609 |
| 6 | Counterparties each see the other's legal name, per interaction | behavior | no | Out of scope 2026-09-30; no purchase/RSVP-confirmation record exists to bind to | no | unknown | no | none (out of scope, under #219) |
| 7 | Name legible 12 months from the interaction, then display name | behavior | no | Out of scope; depends on 6 | no | unknown | no | none (out of scope) |
| 8 | Interaction is the only path to a name: no search, lookup, roster, export | invariant | unknown | Holds trivially today (nothing renders a legal name) [A]; nothing guards it. Out of scope with 6-7 | no | unknown | no | none; folded into guard #611 |

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (#608), 5 (#609) | `build-ticket` | code + check |
| NO-CHECK | 1 (#610) | `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 3 (#611); 8 later | `build-ticket` (guard ticket) | a standing guard |
| SPEC-CONFLICT | none; 6-8 are deferred by ruling, revisit with counsel | `scope-scenario` when counsel reports | n/a |
| NOT-REVIEWED | 1, 2, 3 (#497 review-skipped) | `review-pr-bundle` | review |
| NOT-SMOKED | all | CI / smoke coverage ticket | smoke result |
| NOT-LOOKED | all | `record-pm-review` once the above are clear | UAT Issue |

Filed today (Gates: none, Path: well-worn, no milestone, none needs Don): #608 (criterion 4), #609 (criterion 5), #610 (check 1), #611 (guard 3).

## Next, in order
1. #608 and #609 (operator view and the NULL flag; one lane). 2. #611 guard, then #610 check. 3. Review #497's signup work. 4. Revisit 6-8 after counsel.
