# The owner edits their Page

*2026-09-18. Don: "There is no way to edit a Page." He was right, and here is why.*

## The cause

`group.update_draft` refuses any row whose `lifecycle_state` is not `'draft'`.
Every Page a member has finished creating is `'active'`. **The only update
handler in the project rejected every finished Page by design**, so nothing
anyone made was changeable.

## `group.update` — a second handler, not a mode flag

Three things differ from editing a draft, and each is the reason this is its own
handler rather than a loosened check on the first:

- **The slug is frozen.** `update_draft` re-derives the slug on every rename
  because a draft's address is not public. A live Page's address has been
  shared and linked; moving it breaks every one of those. `verbs.md` already
  forbids it. **The name changes; the address does not** — asserted by a test.
- **The edit is an event.** Per-step draft saves emit nothing on purpose — they
  would flood the log. An edit to something people can already see belongs in
  the Page's history, so this writes `group.updated` naming the fields.
- **Dissolved is distinguished from active.** `update_draft` lumps them together
  as "not draft". One is a state you can edit out of; the other is not.

Everything else is deliberately identical. Two handlers with one rule each beats
one handler with a mode flag.

## A second live bug, found on the way

**`viewerOwnsPage` asked for `role = 'owner'` unconditionally.** A non-business
Page's founder holds `'steward'` — never `'owner'` — so the founder of a run
club, an interest Page or a practice **was not recognised as owning their own
Page**, and every owner-only affordance was hidden from them. The exact trap
`group.update_draft` warns about in its own comments.

It now derives the role from the Page kind. `ResolvedShop` carries `kind` rather
than assuming it, because a wrong assumption there hides the owner's controls
from the owner.

Only `business` Pages resolve through `resolveShop` today, so this was latent —
but it would have bitten the moment other kinds resolve, which is the create-flow
bug reported separately.

## The owner surface

Viewing your own Page now shows an **owner bar** at the top: *Edit* and
*Announce*, with "Your Page — only you see this".

**Server-side, not a hidden button.** Ownership is resolved on the server and
the component is not rendered at all for anyone else — the markup is absent, not
`display:none`. And the writes behind it re-check the managing role, so the bar
is a courtesy rather than the boundary.

In plain sight rather than in the ⋯ menu. Burying "edit" in an overflow menu is
how Don came to say there was no way to edit a Page.

## `/manage/<slug>`, not `/p/<slug>/edit`

Next.js refuses a segment after a catch-all — `/p/[...slug]/edit` fails the
build outright. A sibling top-level route keeps one resolver and one ownership
check and needs no URL gymnastics. A non-owner gets **404, not 403**, the same
pattern the operator review uses.

## Two things the form does deliberately

**The address is shown, frozen, with the reason said out loud** rather than the
field being silently absent. A field that quietly is not there reads as a
missing feature — which is the failure mode that produced this ticket.

**A failed save says why.** The handler's messages are written to be read by the
owner and are passed through verbatim rather than replaced with "something went
wrong". Don hit a save failure and could not tell whether it was his input or
ours; that is the thing being fixed.

## Checks

`tsc` clean · build passes · conformance clean · 247 tests across the handlers,
the surface and the resolvers, including that a rename never touches the slug
and that a steward of a non-business Page may edit it.
