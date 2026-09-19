# Object types, as pointers — and the authority that was flattened

*2026-09-19. The deferral is retired. It had two chances and fired zero times,
because there was no shape a declaration could take.*

## Why the deferral went rather than being restated

"A noun gets a declaration the next time a handler touching it is edited" was
written on 2026-09-17. Since then `group.update` was added and `report.reverse`
was added — two handlers touching Page — and `links.ts` has one commit in its
history. The rule fired zero times out of two, and it could not have fired:
`ObjectTypeName` was a string union, so there was nothing for a declaration to
be. A rule with no hook is a wish. Ruled 2026-09-19: build them as pointers.

## What a declaration is, and the line it may not cross

A name, a status in `nouns.md`'s own four-state vocabulary, and where that file
defines it. **No fields, no columns, no tables, no types.** `links.ts` may name a
table because a check compares against it; an object type may not, because there
is nothing here for a table to be checked against. A test asserts the key set
exactly, so the drift into a second copy of the migrations fails rather than
happening gradually.

## The status is checked, not asserted

Without that, this is a document, and a document saying a noun is live while
nothing relates it is precisely the failure the whole file exists to avoid. **A
noun declared `live` must be related by at least one link that is actually
built.** A wrong status is a red build.

The check immediately earned itself: `Announcement` and `Tag` are declared live
here and `nouns.md` still marks both **postponed**. Announcement is `page_posts`
with two handlers and a browse read; Tag is `page_tags`, written by
`group.activate`. That file needs the correction, and now something says so
rather than nobody noticing.

## A role is not a noun

Don rejected **Person** as a noun — generic, means nothing here. The words that
replace it in conversation are not object types either: creator, organizer,
follower, patron are one person in different relations to a Page. Putting any of
them here turns a relation into an identity, which `nouns.md` refuses from the
other side — a Member has "no type, tier, or stored role". `REJECTED_AS_NOUNS`
holds the list and a test enforces it.

**`Member` is the exception on his list, and worth knowing about.** It does two
jobs: the account (one real human) and the relation (a member of a Page,
`group_memberships`). Only the second is a role, and it is a link.

## The flattening he asked about was real

Creator/organizer is authority, not attachment — the only relation implying the
ability to change a Page. `group_memberships` carries **two** columns:
`relationship` (attachment) and `role` (authority — `owner` or `steward`,
branching by Page kind). Every managing check in the code reads `role`.

The registry declared links on `relationship`, plus one on
`groups.founder_member_id` — which records who **started** the Page and is not
what any permission consults. **Nothing declared the column authority actually
runs on.** Today they coincide because `group.create` writes both; nothing makes
them stay that way, and a steward who did not found a Page has authority under
neither declared link.

`a Member runs a Page` now declares it, and a test asserts it never collapses
into the founder link — different columns, because they are different facts.
