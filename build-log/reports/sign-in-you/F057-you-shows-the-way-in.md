# F057: someone who isn't selling yet finds the way in

category: sign-in-you · as-of: 2026-10-10 · scenario approved 2026-09-10 (no `gates:`) · tickets: #15 (open, T125 "You gains a producer state"; no work on it) · PRs: #379 (rebuilt You, main), #516 (Unfinished Pages), #30/T149 redirect
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. `area:` label: the feature's Issue #15 has none; picked `sign-in-you` (closest, where You lives).

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 5 criteria | 2 | 0 | 0 | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **2, 3, 4** (open #15 covers them; nothing was built for it, per its own comment). Built means code on main [V grep of `src/app/you/page.tsx`, `next.config.ts`]. The producer state never shipped: You today shows the same "Your Pages" section to everyone, with an empty line "You haven't made a Page yet. Tap Create to start one." [V `OwnPages.tsx`], and no invitation.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/you` has no "vendor", "market" or "business owner" and queries none of the dead tables | invariant | yes | #379 removed the vendor tabs, market picker and vendor toggle. Rendered text and the You component tree read today contain none of the words; it queries only `members`, `member_notices`, `groups` and the follows projection [V grep]. Absence of code, no standing guard | no | no (#379 `review-skipped`) | unknown | no | guard #582 |
| 2 | A Member with no Page sees no shop controls, only their own stuff and one invitation | behavior | **no** | Your Pages always shows, with a "Start something" link; the empty state is one line, not an invitation. #15 | no | no | unknown | no | #15 (open) |
| 3 | The invitation names specific maker categories, with one worked example | behavior | **no** | Nothing found [V grep "maker", "worked example"]. The wording is new user-facing copy, so it goes to Don | no | no | unknown | no | #15 (open) |
| 4 | A Member with Pages sees a row per Page (Edit shop + create controls) and their listings, reusing the existing query | behavior | **no** | Built half: a card per Page with Edit page and "Start something" (`OwnPages`, `getOwnPages`) [V]. Missing half: their listings are not on You. "Edit shop" is old wording; nouns.md says Page (#100) | no | no (#516 reviewed, covers drafts only) | unknown | no | #15 (open) |
| 5 | `/following` redirects to `/you/following`; sign-out and follow list as shipped | behavior | yes | Redirect in `next.config.ts` [V]; `/you/following` page and `SignOutButton` on You exist [V]. The old `src/app/following/page.tsx` is still on disk, shadowed (the scenario says no deleting) | unmarked: `tests/retired-routes.test.ts` asserts the redirect; no test found for sign-out or the follow list [A] | no | unknown | no | check #583 |

Reviewed: #379 carries the `review-skipped` label and no `Reviewed by:` line [V]. Shipped: `Unit tests`, `Browser`, `Lint, types, build` green on 0e3b4bd (#516, a later main commit); on #379's own merge commit 9ff415f `Migrations applied to production` failed [V check-runs]. Smoked: no smoke result tied to any F057 commit [A, as for F081].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 2, 3, 4 | `build-ticket` on #15 (needs `write-tickets` first: the Issue body points at an archived ticket); 3's copy to Don | code + checks |
| NO-CHECK (built, nothing asserts it) | 5 (test unmarked, sign-out and follow list untested) | `write-tickets` (one check ticket) then `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 1 | `write-tickets` (guard ticket scanning `/you` and its components for the three words and the dead table names) then `build-ticket` | a standing guard |
| SPEC-CONFLICT | none (wording: "shop" and "producer" vs Page, #100) | `scope-scenario` if Don wants the words changed | n/a |
| NOT-REVIEWED | 1, 5 (#379 skipped) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: guard #582 (criterion 1), check #583 (criterion 5). Criteria 2, 3, 4 not filed: open #15 covers them. Unplanned (no `gates:`): both filed Issues have no milestone.

## Next, in order
1. Rewrite #15 into real tickets (producer state split, invitation, listings per Page); the invitation copy goes to Don. 2. Guard ticket for criterion 1, check ticket for criterion 5. 3. Review and smoke. 4. UAT Issue.
