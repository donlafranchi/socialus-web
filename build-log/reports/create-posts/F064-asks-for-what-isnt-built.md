# F064: someone asks for something that isn't built

category: create-posts (no Issue carries an `area:` label; closest fit, creating a Page) · as-of: 2026-10-10 · scenario approved 2026-09-07 (criterion 1 amended 2026-09-15) · gates: none · tickets: #33 (open, no area label, no milestone) · PRs: none
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **coverage**, **external**.

## Roll-up

| | built | checked |
|---|---|---|
| 5 criteria | 0 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a `[guards F###.N]` marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **all five** (covered by open #33). No PR cites F064 [V `gh pr list`]; no build-log line for it [V grep]; no signal table in `supabase/migrations` [V grep]. Not-reviewed, not-shipped and not-smoked are `no` only because nothing exists.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked | Issue |
|---|---|---|---|---|---|---|---|---|
| 1 | One signal table, two sources (unmapped label, Other description), each row says which | behavior | **no** | No table. `group_category_suggestions` (20260911160535) is the retired free-text table, a different thing, nothing reads it [V]. Both sources sit behind unruled drafts (label layer, F088) per #33 | no | unknown | no | #33 |
| 2 | Tap on a not-built option is acknowledged; second tap by the same person is a no-op via a constraint | behavior | **no** | No such option or action. The only "Coming soon" in the app is the Values & badges card in the Page editor, nothing to tap, no record (`EditCards.tsx:119`) [V] | no | unknown | no | #33 |
| 3 | No copy in this flow implies a date, plan or queue position | invariant | **no** | No flow, so no copy; absence proves nothing and nothing guards it | no | unknown | no | #33 |
| 4 | The person who signaled sees no count | invariant | **no** | No flow, no count; nothing guards it | no | unknown | no | #33 |
| 5 | Operator can group the raw table by subject, ranked list, no screen | behavior | **no** | No table, no query or view [V grep] | no | unknown | no | #33 |

Reviewed / Shipped / Smoked: no F064 PR exists, so none [V]. Note: #33's body is partly stale (still says three sources); its 2026-09-15 correction comment narrows to two and says to build the table and ranked query, then stop, until the label layer and F088 drafts are ruled on [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 1, 2, 5 (table + ranked query buildable now; 1 and 2 sources wait on drafts) | `build-ticket` on #33 | migration + query + checks |
| NO-CHECK | none (nothing built) | n/a | n/a |
| INVARIANT-UNPROVEN | 3, 4 (become real once criterion 2 ships; guard ships with it) | `build-ticket` on #33, guard in the same PR | standing guard |
| SPEC-CONFLICT | none | n/a | n/a |
| NOT-REVIEWED / NOT-SMOKED / NOT-LOOKED | all | after the above | n/a |

Filed: none. Every gap is covered by open #33 (scenario, approved, no `area:`/milestone; scenario has no `gates:`, so none added). I cannot relabel existing Issues.

## Next, in order
1. #33: table with a `source` column, unique-per-person constraint, ranked operator query. 2. Rule on the label layer and F088 drafts so the two sources and the tap (criteria 1, 2) can be wired. 3. Guard for 3 and 4 with the build.
