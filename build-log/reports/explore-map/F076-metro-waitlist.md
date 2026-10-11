# F076: a person outside an open metro joins its waitlist

category: explore-map (no F076 Issue carries an `area:` label; closest of the list) · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended to 2026-09-27), gates: launch · tickets: #77 (T163, closed), #193 (T167, closed), #194 (T168, closed), #216 (closed), #196 (closed), #195 (open question, rate limiting) · PRs: #86, #191, #197, #198, #217
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing), **coverage** (all of a set).

## Roll-up

| | built | checked |
|---|---|---|
| 16 criteria | 12 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **4** (member and email cross-count, #613), **7** (signed-in popup reads a live count, #614), **8** (same figure everywhere, #615), **15** (the one "metro opened" message and discarding, #616). Built means code seen on main [V]. Checked: **zero `[guards F076.N]` markers exist** [V grep src, tests, scripts], so every test below is `unmarked`. Reviewed: none of PRs #86, #191, #197, #198, #217 carries `Reviewed by:` or `review-skipped` in its body [V]; all predate the 2026-10-05 rule. Shipped: deploy-health success on 8ad3ee56 (#198), lint/types/build/unit success on a3faf37c (#217) [V]. Smoked: smoke-live is failing on recent main commits and is not tied to these merges [V], so 0.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Filed |
|---|---|---|---|---|---|---|---|---|
| 1 | Every US metro is in the list at signup | coverage | yes | 296 metros seeded as the catalog; the picker offers all [V migration, `MetroWaitlistStep`] | unmarked: `tests/migrations-metro-waitlist.test.ts`, `MetroWaitlistStep.test.tsx` | unknown | no | #617 |
| 2 | Zip may suggest a metro; never IP, default or nearest-match selection | invariant | yes | Picker starts on a non-metro placeholder; F081 zip decides the member's metro. No zip shortlist built (optional: "may") [V] | unmarked: `MetroWaitlistStep.test` "selects no metro for them"; nothing scans for IP/nearest | unknown | no | #618 |
| 3 | Role is on the waitlist entry, none pre-selected, no role on the member | invariant + behavior | yes | `metro_waitlist.role` check creator/patron, no default; radios unchecked [V]. Discarding the answer when the metro opens is not built (see 15) | unmarked: `MetroWaitlistStep.test`, `MetroNotCoveredPanel.test` "pre-selects neither role"; no guard on `members` | unknown | no | #618, #616 |
| 4 | One person counts once in one metro, signed up or email only | behavior | **no** | Each path is idempotent alone (unique member index, unique `lower(email)` index, PR #191/#197). A person who leaves an address and later signs up holds two rows and counts twice; the member handler never reads the auth email [V] | yes for each path alone (`waitlist-join*.test`, migrations tests), unmarked; cross case untested | unknown | no | #613 |
| 5 | Changing metro moves the count, no double count or strand | behavior | yes | Update plus down/up bump in one transaction, both handlers [V] | unmarked: `waitlist-join.test`, `waitlist-join-anonymous.test`, `migrations-metro-waitlist-anonymous.test` | unknown | no | #617 |
| 6 | Creator and patron counts stored separately, readable apart | behavior | yes | `creator_count`, `patron_count` on `metro_polygons` [V] | unmarked: `migrations-metro-waitlist.test` "counters recompute" | unknown | no | #617 |
| 7 | A popup shows a count for everyone, from the cache | behavior | **no** | Anonymous path uses the cached figure (`waitlist-counts.ts`, PR #217). Signed-in path writes then reads the live counts and shows them [V `metro-waitlist-actions.ts`]; build log says "deliberately", the scenario says everyone | yes for the anonymous path, unmarked: `MetroNotCoveredPanel.test`, `metro-waitlist-anonymous-actions.test`; signed-in asserts the live read | unknown | no | #614 |
| 8 | One combined number against 300; same figure as the picker's ordering | behavior | **no** | Combined-only against 300 [V `metroStanding`]. Signed-in popup shows a different, fresher figure than the picker, up to an hour apart [V] | unmarked: `waitlist-standing.test`, `MetroWaitlistStep.test` (the split is hidden; "same figure" untested) | unknown | no | #615 |
| 9 | Message says what is needed, never a date or a promise | behavior | yes | `standingMessage` (remaining count only) [V] | unmarked: `waitlist-standing.test`, `MetroNotCoveredPanel.test` "promises no date" | unknown | no | #617 |
| 10 | Eligible only at 50 creators and 250 patrons | behavior | yes | `metroStanding.eligible` uses both thresholds [V]; nothing consumes it yet (no operator view) | unmarked: `waitlist-standing.test` (49 creators at 300 is false) | unknown | no | #617 |
| 11 | Thresholds per metro, no migration or deploy | behavior | yes | Per-metro columns, default 50 / 250, plain UPDATE [V] | unmarked: `migrations-metro-waitlist.test` "lets a threshold be changed with an UPDATE" | unknown | no | #617 |
| 12 | Opening a metro is deliberate; crossing the threshold never opens it | invariant | yes | No code writes `is_open` except the Sacramento seed [V grep]. The deliberate act is a raw database UPDATE; no operator path exists | unmarked: handler tests assert no `is_open` write, two handlers only | unknown | no | #618 |
| 13 | Leave an email, no account, no password, no name | behavior | yes | `MetroNotCoveredPanel` email form, `metro.waitlist_join_anonymous` (PR #197, #198) [V] | unmarked: `MetroNotCoveredPanel.test`, `waitlist-join-anonymous.test` | unknown | no | #617 |
| 14 | Identical response for a new and a known address, same number | invariant | yes | Result type has no flag or count; number comes from the cache, not the write [V] | unmarked and mock-only: `waitlist-join-anonymous.test`, `metro-waitlist-anonymous-actions.test`. The build log records this exact test passing while false against Postgres; no real-database differencing test | unknown | no | #618 |
| 15 | An address is used only to say the metro opened, then discarded | behavior + invariant | **no** | Addresses are stored and the panel states the single use. No send, no discard, no mail provider, no way to open a metro that triggers either [V grep] | no (panel wording only: `MetroNotCoveredPanel.test`) | unknown | no | #616 (needs-pm) |
| 16 | Metros are ordered by the cached waiting count | behavior + invariant | yes | `withWaitingCounts` and `splitByOpen` sort not-yet metros by cached count, alphabetical tiebreak [V `feed-metro.ts`] | unmarked: `feed-metro-sort.test`; no guard that the ordering path never reads live | unknown | no | #618 |

Filed: #613 (criterion 4), #614 (7), #615 (8), #616 (15, needs-pm), #617 (check 1, 5, 6, 9, 10, 11, 13), #618 (guard 2, 3, 12, 14, 16). All on milestone Beta 11-06; #613, #614, #615, #617, #618 are `launch-blocking`. Related, not filed: #195 (open question on rate limiting an anonymous caller; count inflation, not a criterion).

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (#613), 7 (#614), 8 (#615), 15 (#616, waits on Don) | `build-ticket` per Issue | code + check |
| NO-CHECK | 1, 5, 6, 9, 10, 11, 13 (#617) | `build-ticket` (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | 2, 3, 12, 14, 16 (#618) | `build-ticket` (guards listing the surfaces to scan) | standing guards |
| SPEC-CONFLICT | none (the signed-in live count diverges from the scenario; the scenario wins, filed as 7 and 8) | | |
| NOT-REVIEWED | all PRs | `review-pr-bundle` | reviewer pass |
| NOT-SMOKED | all | CI: tie smoke to the merge commit, cover the metro panel | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the rows above are clear | closed UAT Issue |

## Next, in order
1. #613, #614, #615 (agents can finish). 2. #616 once Don names the mail provider and approves the message. 3. #617 and #618 (tests and guards). 4. Review and smoke coverage. 5. UAT Issue.
