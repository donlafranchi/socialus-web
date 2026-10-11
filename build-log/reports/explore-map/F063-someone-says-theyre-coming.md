# F063: someone says they're coming

category: explore-map (no Issue carries an `area:` label; closest fit) · as-of: 2026-10-10 · scenario approved 2026-09-10 (no `gates:` field) · tickets: #34 (open, T153) · PRs: none
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **coverage**, **external**.

## Roll-up

| | built | checked (marked) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 4 criteria | 0 | 0 | 0 | 0 | 0 | 0 |

Not built: **1, 2, 3, 4**, all under open ticket #34 [V]. No PR cites F063 or T153 [V `gh pr list`]; no build log or test mentions either [V grep]. What exists is groundwork only: the `item_responses` table (with `withdrawn_at`, kind `rsvp`), the event kinds `item.responded` and `item.response_withdrawn`, and RLS for who may read RSVPs [V `015_items.sql`, `20260930180000_member_reads_self_only.sql`]. No app code writes `item_responses` and no UI offers the control [V grep of `src`].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Reviewed | Smoked | PM looked |
|---|---|---|---|---|---|---|---|---|
| 1 | Tap writes a response row and its event row in one transaction; count updates | behavior | **no** | Table and event kinds exist; no action, RPC or button. Feed `response_count` reads rows with `withdrawn_at is null` (`016_discoverable_items.sql`) but nothing ever inserts. #34 | no | no | unknown | no |
| 2 | Tap again withdraws, no dialog; double-tap is a no-op enforced by a database constraint | behavior + invariant | **no** | `withdrawn_at` column exists; **no unique constraint** on (item_id, responder_member_id, kind) in any migration [V grep]. #34 | no | no | unknown | no |
| 3 | A signed-out tap survives sign-in and is recorded on return | behavior | **no** | Generic `/auth/login?next=` return exists; nothing carries a pending response through it. #34 | no | no | unknown | no |
| 4 | Count is distinct people, never rows | invariant | **no** | Count is `count(*)` over rows, not distinct responders, and with no unique constraint duplicates are possible (`016_discoverable_items.sql`, `20261007020000_archived_pages_every_path.sql`). Builder responses are excluded in the newer one. #34 | no | no | unknown | no |

Reviewed: no PR [V]. Shipped: nothing to ship; latest main CI is green but carries no F063 change [V]. Smoked: unknown, nothing to cover.

Filed: none. All four gaps are NOT-BUILT and open #34 already covers the whole scenario (title "F063 · T153 · People can say they're coming"); not duplicated. Note: #34 has no `area:` label and no milestone, and its body says "Bundle: launch" while the scenario has no `gates:` field.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 1, 2, 3, 4 | `build-ticket` on #34 (architecture note first: schema constraint, RPC) | code + checks |
| NO-CHECK | none yet (nothing built) | n/a | n/a |
| INVARIANT-UNPROVEN | 2 (constraint), 4 (distinct count), once built | `write-tickets` (guard ticket) after #34 | a standing guard |
| NOT-REVIEWED / NOT-SMOKED | all, once built | `review-pr-bundle`; CI smoke on the event page | review, smoke result |
| NOT-LOOKED | all | `record-pm-review` once the above are done | closed UAT Issue |

## Next, in order
1. Build #34 (all four criteria; unique constraint and distinct count first). 2. Then a guard for 2 and 4 and checks for 1 and 3. 3. Review, smoke, UAT Issue.
