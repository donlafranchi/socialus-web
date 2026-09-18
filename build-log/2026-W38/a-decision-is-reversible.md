# A moderation decision is a reversible event

*2026-09-17. Follows the operator review (#12) in the same day. One migration.*

## What Don asked for

*"We actually want two buttons. And perhaps a record of what happened in order
to reverse."*

## The discovery that made this a migration

`report.remove`, as merged two hours earlier, set `groups.photo_url = null`.
**The URL was destroyed, so there was nothing to restore a removal to.**
Reversibility was not a feature missing from that shape — it was impossible in
it, and no amount of UI would have added it.

The fix is the pattern the codebase already states about itself, in
`visible-photo-url.ts`: *"Hiding is a projection concern, not a deletion."*
Removal now works the same way. `photo_removed_at` joins `photo_hidden_at`, the
read path refuses both, and neither the URL nor the bytes are touched.

## The migration, in three parts

1. **`report_decisions`** — append-only, and **the source of truth**. What was
   decided, by whom, when, the reason code, optional free text, and
   `reverses_decision_id` when it undid something. A unique index allows one
   reversal per decision; two is how reviewers ping-pong.
2. **`groups.photo_removed_at`** — so removal stops destroying the URL.
3. **A backfill** of every review already made, so the log is complete from the
   start rather than beginning mid-history. Re-runnable; skips a review whose
   reviewer is gone rather than attributing it to nobody.

`reports.reviewed_at` / `reviewed_by_member_id` / `outcome` stay as a
**projection** of the latest decision. Two sources of truth is a real cost,
taken deliberately: three things read those columns — the queue's
`where reviewed_at is null`, the `reports_review_is_complete` constraint, and
`report.create`'s open-report cap. **The table comment says which side wins.**

## The surface

**Two buttons, both always present.** Approve and Reject side by side, each
opening its own short list of presets. One tap for the outcome, one for the
reason. Free text appears only under *Something else…* and the schema refuses
that code with nothing written — an empty "other" is not a reason.

**No confirm dialog and no undo window.** A confirm that fires on every removal
is one people learn to dismiss without reading, and a timed window adds a clock
while being strictly weaker than permanent reversibility. The protection is that
undo is always available and the history is on the item.

**Decided reports stay in the list**, below the undecided ones. You cannot
reverse what you cannot see, and hiding them would make undo a support request.

**The history renders on the card** — outcome, reason, who, when, and whether it
was itself a reversal — each row carrying its own *Undo this*.

## Reason codes in the CHECK, words in TypeScript

Codes are internal and stable, which is what makes decisions countable. The
wording is Don's under public-is-draft and will change; if it lived in the CHECK
every rephrasing would be a migration and a production apply.

**Every preset is written to be read by the member whose content it was.** A
reason nobody can be told is a reason that cannot be appealed. Whether they are
told is unsettled — F058 criterion 2 covers the *report*, not the *outcome* —
and is flagged for Don.

## The safety gap, taken seriously rather than filed as a limit

Preserving the bytes means **removed content stays fetchable by anyone holding
the direct storage URL, permanently.** For ordinary bad content that is the
right trade. For illegal content it is not, and *"we kept it so it could be
reversed"* is the wrong answer.

`docs/purge-proposal.md` specifies the irreversible path: a separate action, on
already-removed content, with a confirmation precisely because it cannot be
undone, recorded like any other decision. **Not built.** It needs a storage
policy migration, and the recommendation is a narrow operator delete policy
rather than a service-role key — the latter would mean amending a conformance
rule that exists for good reasons.

## F058 amended

Criterion 4 said removal *"nulls the URL, deletes the storage object"*. **Both
halves are now wrong, and one never was true** — the bucket policy is
`media authenticated delete own folder`, so the operator's key could never
delete another member's object. Amended in ops-pattern `7f22a2d`, along with a
new criterion 6 for reversibility and a note that the scenario's singular
"operator" makes delegation an amendment rather than a ticket.

## Checks

`tsc` clean · build passes · conformance clean · 143 tests across the handlers,
the surface, the queue, the read path and the migration. The two that matter
most: a non-operator is refused before the database is touched, and a reversal
**inserts** — asserted by proving no UPDATE or DELETE ever touches
`report_decisions`.
