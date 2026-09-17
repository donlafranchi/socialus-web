# Purge — the irreversible path, specified and not built

*2026-09-17. Written because the gap it closes is a safety gap, not a known limit.*

## The problem, stated plainly

Reversible removal preserves the bytes. `photo_removed_at` stops every surface
in the product serving the URL, and `photo_url` and the storage object are left
alone — that is precisely what makes a removal undoable days later.

**The cost: removed content stays fetchable, permanently, by anyone holding the
direct storage URL.** That was already true of hidden photos and was recorded in
`visible-photo-url.ts` as a known limit. It is now also true of removed ones.

For ordinary bad content this is the right trade: a wrong removal is recoverable
and nobody is harmed by bytes nobody can find. **For illegal content it is not
an acceptable end state, and *"we kept it so it could be reversed"* is the wrong
answer.** A platform carrying member photos will eventually see some.

## What purge is

A **second, separate action** — not a mode of removal.

- **Irreversible, and honest about it.** It deletes the storage object. There is
  no undo, and the UI must not imply one.
- **Deliberate.** It carries a confirmation, unlike decide and reverse. That is
  not inconsistent with dropping the confirm elsewhere: the argument for
  dropping it was that reversibility is better protection than a dialog. Where
  there is no reversibility, the dialog is what is left.
- **Two steps, never one.** Purge acts on content that is *already removed*. The
  operator removes first, then purges — so nothing is destroyed in a single tap
  from the queue, and the common case never touches this path.
- **Recorded like any other decision**, in `report_decisions` with its own
  outcome value: who purged what, when, and why. The row survives the bytes.

## What it needs, and why Don has to run it

**A storage policy migration.** The media bucket's delete policy today is
`"media authenticated delete own folder"` (migration 039): a member may delete
their own folder and nobody else's. The operator is not the owner of the
reported member's folder, so **the operator's key cannot delete the object**.

Two ways to close that, and the choice is Don's:

1. **A policy allowing the operator to delete in `media`.** Narrow, auditable,
   and it keeps everything inside the existing key. It needs the operator's
   member id to be knowable in SQL — today it is an env var the database has
   never heard of, so this implies a small operator table or a settings row,
   which is the same substrate delegated reviewers will need.
2. **A service-role key on the server.** Simpler, and **forbidden by the
   action-layer conformance rules** — `SUPABASE_SERVICE_ROLE_KEY` trips
   `no-restricted-syntax` today. Taking this route means deliberately amending
   that rule, which should not happen quietly.

**Option 1 is the recommendation**, because it does not weaken a rule that
exists for good reasons, and because the operator-identity-in-the-database step
is needed for delegated reviewers anyway.

## Schema sketch

```sql
-- outcome gains a third value
check (outcome in ('restored', 'removed', 'purged'))

-- and the Page records that the bytes are gone
alter table public.groups add column photo_purged_at timestamptz;
```

`photo_url` is nulled by purge — unlike removal — because the object behind it
no longer exists and a URL pointing at nothing is worse than no URL.

## What stays true after purge

The **report and its decision history survive**. Purge destroys the image, not
the record of what happened to it. Who purged it, when, and why remain readable,
which is the whole point of the decisions log being append-only.

## Not in scope here

Automated detection, legal reporting obligations, retention of purged material
for law enforcement, or anything resembling a strikes or bans system. Each is a
real question and none is answered by this.

## Status

**Specified, not built.** It needs the storage policy decision above, which is a
migration Don should run knowingly rather than find in a batch.
