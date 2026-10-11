# F065: someone follows a person, Page or venue, and nothing else changes

category: sign-in-you · as-of: 2026-10-10 · scenario approved 2026-09-07 (no `gates:`) · tickets: none cite F065 (nearest: #103 F067 closed, #267 bug closed, #583 F057 follow-list check, open) · PRs: #104 (F067, the Page half), #268 (owner keeps role on unfollow)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing). Area: no Issue carries an `area:` label; `sign-in-you` chosen because the list lives at /you/following.

## Roll-up

| | built | checked | reviewed | smoked | PM looked |
|---|---|---|---|---|---|
| 5 criteria | 3 | 0 | 0 | 3 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS). Reviewed = the row says yes. Smoked = a green smoke-live run came after the feature's last merge (pages load; not behaviour). PM looked = a linked Issue or the feature Issue carries pm-reviewed.*

Not built: **3** (a follower of a business is routed as a seller), **5** (three tables, not one). Nothing in the repo carries a `F065` guard marker; the only mentions are two comments in F067 code [V grep]. Built means code on main [V]. Shipped: PR #104 merge 45c43610 has lint, migrations-from-scratch and production-behind-main all success [V]; person and venue follow predate it and are assumed shipped [A].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | Following a person, Page or venue writes one row plus its event row in one transaction | behavior | yes | Person: `member_follows` + `member.followed` in `withTransaction` (`actions/member/follow.ts`). Page: `group_memberships` + `group.member_joined` (`actions/group/follow.ts`). Venue: `member_saved_searches` + `member.saved_search.created` (`saved-search-create.ts`) [V] | unmarked: `group/follow.test.ts` ("writes an event", mock only); person and venue tests only grep the source text (`actions-t091`, `actions-t109`); none asserts same-transaction | unknown | no | #606 |
| 2 | A follow never grants membership, a role or unlisted read access, checked against every authorization/roster path | invariant | yes | Follower row is `role='member'`, `source='soft_via_follow'`; manager checks key on role (`post.ts`, `lifecycle.ts`, `update.ts`, `item/create.ts`) [V sampled]. Partial proofs: `group/follow.test.ts` "grants no role beyond the plain one", `tests/follower-privacy-db.test.ts`, `tests/page-owner-follow-db.test.ts`. No test walks every roster/authz path; no `F065` marker | no (partial, unmarked) | unknown | no | #607 |
| 3 | A Member who follows a business and owns no shop still sees Sell offer to start something | behavior | **no** | `hasActiveBusinessGroup.ts` and `getDraftGroup.ts` count any `group_memberships` row with `left_at is null` on an active business Group; neither filters `relationship`/`role`, so a business follower is read as a seller and `SellCta` routes to /you/sell instead of the start walkthrough [V]. Neither test file mentions follower | no | unknown | no | #604 |
| 4 | Unfollow then re-follow revives the original row | behavior | yes | Person: `on conflict ... unfollowed_at = null`; Page: `on conflict ... left_at = null`; venue: `saved-search-restore` clears `removed_at` [V] | unmarked: `group/follow.test.ts` "is idempotent" (mock); person and venue only grep source text | unknown | no | #606 |
| 5 | The following list reads from one table, not three | behavior | **no** | `get-member-follows.ts` unions `member_follows`, `group_memberships` (source explicit) and `member_saved_searches`; its own header calls them "three substrates" [V]. Test `get-member-follows.test.ts` asserts the union | no | unknown | no | #605 |

Reviewed: PR #104 has no `Reviewed by:` section (label `human-review`); PR #268 has none [V]. Smoked: `smoke-live` is nightly, not per commit; no run ties to these merges [A]. PM looked: no `uat` Issue for F065 or F067 [V].

Filed: #604 (criterion 3), #605 (criterion 5, needs-pm), #606 (check 1, 4), #607 (guard 2). No milestone: scenario has no `gates:`, listed as unplanned. Related open: #248.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 3, 5 | `write-tickets` then `build-ticket` (5 is `Path: new territory`, to the PM first) | code + check |
| NO-CHECK (built, nothing asserts it) | 1, 4 | `write-tickets` (one check ticket) then `build-ticket` (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | 2 | `write-tickets` (guard ticket: scan every `group_memberships`/`member_follows` reader and policy for role, roster and unlisted read) then `build-ticket` | a standing guard |
| SPEC-CONFLICT | none | n/a | n/a |
| NOT-REVIEWED | #104, #268 | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. Criterion 3 (the Sell routing bug). 2. Guard ticket for 2, check ticket for 1 and 4. 3. Criterion 5 once the PM rules on collapsing the three substrates. 4. Review, smoke, UAT.
