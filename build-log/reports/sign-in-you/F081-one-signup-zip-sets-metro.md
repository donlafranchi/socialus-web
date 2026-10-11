# F081: everyone signs up the same way, and the zip sets the metro

category: sign-in-you · as-of: 2026-10-10 · scenario approved 2026-09-14 · tickets: #222 (closed, covered all 9 criteria), follow-ups #568, #569, #570 · PRs: #283, #282, #497
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. A cell is `yes`, `no` or `unknown`; the note says what exists and what is missing.

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 9 criteria | 5 | 1 | 0 | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **4 (second half), 8, 9** (tickets #568, #569, #570). Built means the code exists on main [V build log + grep]; shipped means deploy-health was green for the merge commit.

## Per criterion

| # | In plain words | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Four fields, 18+/Terms box, email verified | yes | One screen in #497. Email confirmation is on in production [V code comment]. | no: the only marker (`phone.test.ts`) tests the phone, not this | no (#497 skipped) | unknown | no |
| 2 | Zip never shown to others (**invariant**: absence of code proves nothing) | unknown | Nothing found that shows it [A]; `LocallyOwnedClaim` shows the owner their own zip's proximity. | no | no | unknown | no |
| 3 | The zip sets the metro and the screen says which | yes | Works for Sacramento zips only: "You're in Sacramento-Roseville, CA" [V PR body]. | unmarked: `zip-metro.test.ts` exists | no | unknown | no |
| 4 | Nobody picks a metro; changing the zip on /you moves it | **no** | No picker, so the first half is built. **Changing the zip on /you: missing.** Ticket #568. | no | no | unknown | no |
| 5 | A "what this app is for" line; no "never sell" line | yes | In #497. | yes (`EmailFirstSignup.test`) | no | unknown | no |
| 6 | No maker/finder question | yes | In #497. | unmarked: `OnboardingFlow.test.tsx:52` | no | unknown | no |
| 7 | No home place assigned for the person | yes | #283 and #497. | yes (`onboarding/actions.test`) | no | unknown | no |
| 8 | Every US zip resolves; unknown refused | **no** | 126 Sacramento zips only; an unknown zip is accepted and sent to the waitlist step. Ticket #569. | no | no | unknown | no |
| 9 | Phone verification refuses VoIP | **no** | Phone code exists (#282), off behind `PHONE_VERIFICATION_REQUIRED`; no line-type check found. Ticket #570. | no | no | unknown | no |

Reviewed: #497 says `Reviewed by: review-skipped` (lane agent, no browser run) [V]; #282 and #283 have no review section [V]. Shipped: `Deploy health` success on d5ebc936 (#497) [V]. Smoked: `smoke-live` runs on a schedule against main, not per commit, so no run belongs to any F081 commit; the latest nightly failed on a Page route, not signup [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (/you), 8, 9 | `build-ticket` on #568, #569, #570 | code + checks |
| NO-CHECK (built, nothing asserts it) | 1 (marker points at the phone test), 3 and 6 (test exists, unmarked) | `write-tickets` (one check ticket) then `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 2 | `write-tickets` (guard ticket listing the surfaces: profile, listing, search, map, member reads) then `build-ticket` | a standing guard |
| NOT-REVIEWED | all (signup #497 skipped; #282, #283 none) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order

1. Build #568, #569, #570 (`build-ticket`).
2. Mark the checks that already exist (criteria 3, 6) and add checks for 1, 2, 4, 8, 9.
3. Run `review-pr-bundle` on signup, since the review was skipped.
4. Fix the smoke-vs-commit match; then open the UAT Issue for criteria 1–7.
