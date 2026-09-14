# T159 (Issue #61) — report.create, the three limits, and the read-path helper

**Scenario:** F058 — a member reports something, and the operator can take a photo down.
**Depends on:** #13 / #65 (T123, schema). **Blocks:** T160 (#62), T122 (#12).

> **Ticket-number collision, noted not fixed.** `t159-the-composers-category-step-becomes-a-tag-step.md`
> in W37 is a *different* T159, from F071. Two scenarios independently reached
> the same ticket number. `git log --grep F058` still separates them, which is
> what `CLAUDE.md` § Naming relies on, so nothing is broken — but the number
> alone no longer identifies the work. Raised on #61.

## What shipped

- `src/actions/report/create.ts` — `report.create`. Zod input `{ subjectKind: 'group', subjectId, body }`,
  `withTransaction`, `appendEvent`, `AuthorizationError` for anonymous callers.
  Registered as `'report.create'` in `src/actions/index.ts`.
- `src/lib/groups/visible-photo-url.ts` — `visiblePhotoUrl()`, null when
  `photo_hidden_at` is non-null. Ships ahead of its consumer: the render path
  is T145 (#26). The takedown path exists before the first upload is accepted,
  which is Rule 1.
- `supabase/migrations/20260914193755_report_events_not_member_readable.sql` —
  **not in the ticket.** See below.

The report row, the `group.reported` event, and the hide all land in one
transaction. Repeat reports store as separate rows; no limit ever refuses a
report, only the automatic hide.

## The three limits

| Limit | Read as |
|---|---|
| One auto-hide per member per subject | a prior live report by this reporter on this subject |
| A restore is sticky | `photo_hide_locked_url = photo_url` (per #65's amendment — not a boolean) |
| Cap on open auto-hides per reporter | 5 unreviewed; the 6th stores and queues, and hides nothing |

Both counts are read *before* the insert, so a report never counts itself
against its own limits. The `UPDATE ... where photo_hidden_at is null` makes a
concurrent pair of reports produce one hide and one event, not two.

## The deviation: a migration the ticket did not ask for

The ticket says to write `group.reported` to `group_events`. `group_events`
already carries `group_events_select_member_of_group`, which lets any explicit
member of a Group read that Group's events — and `group.create` makes the
founder an explicit member. So the specced write hands the reported party the
`acting_member_id` of the person who reported them, on the next load of their
own Page.

Proven against a real Postgres through RLS before anything was changed, not
inferred from the DDL. F058 acceptance 2 and #62 both forbid exactly this
outcome, so the three F058 event kinds now drop out of that one policy.
Everything else is untouched: the event rows are still written and still read
server-side by the operator, and `group_events_select_acting_self` is unchanged
because it only ever returns a member their own rows.

## Verification

**local Postgres**, migrations applied to the local Supabase instance.

- Full suite **1695 passing**, 0 failing (1663 before this ticket; 32 new).
- `tests/report-privacy-db.test.ts` reads `group_events` through RLS as the
  owner, the reporter's target, and an outsider. Its control row is attributed
  to a *third party* deliberately — attributed to the owner it would come back
  via `group_events_select_acting_self` even with the policy dropped, and would
  assert nothing. Checked both directions: policy dropped → the control fails;
  old policy restored → the three privacy assertions fail.
- `tsc --noEmit` clean in these files (3 pre-existing errors in
  `migrations-t042.test.ts` remain). `npm run lint` unchanged from baseline
  (15 errors / 30 warnings, all pre-existing). `npm run build` passes.
- `npm run check:action-layer` OK.

## Known limits, recorded not fixed

- **Hidden is not unreachable.** A direct link to the storage object still
  resolves while a photo is merely hidden. Reversibility requires it; only
  T122's "remove for good" deletes bytes.
- **A soft-deleted report stops counting** toward the per-member limit, so an
  operator who removes a report restores that member's ability to auto-hide
  that Page. Deliberate — a removed report is one that did not count.
