# Social links are handles, and the owner can change their photo

*2026-09-18. The Instagram save error, diagnosed and fixed.*

## What actually failed

Don's suspicion was that his handle was bogus and that we do no validation. **It
was the opposite: we do strict validation, and it rejected a real handle for not
being a URL.**

Reproduced exactly, against the shipped code:

| Typed | Result |
|---|---|
| `donlafranchi` | refused |
| `@donlafranchi` | refused |
| `instagram.com/donlafranchi` | refused |
| `http://instagram.com/donlafranchi` | refused |
| `https://instagram.com/donlafranchi` | accepted |

The field was `<input type="url" placeholder="https://">` validated by
`isSafeLinkUrl`, which demands a full https URL. The error read *"these links
are not https URLs and were refused: instagram"* — true, unhelpful, and about
our data model rather than his input. **Nobody thinks of their handle as a URL.**

A second contributing fact, fixed in the previous merge: the only update handler
refused active Pages outright, so even a correct URL would not have saved on an
existing Page.

## The fix

**The prefix is shown inside the field, before the caret.** The member types
`donlafranchi` into a box that already reads `instagram.com/`. A label above an
empty box still leaves them guessing whether to type it again.

**Stored as the composed https URL, not the handle.** The column's CHECK already
requires an https URL and every read path expects one, so storing handles would
mean a migration plus a rewrite of both. The handle is what they type and what
the field shows back; the URL is what we keep. A member always sees what they
typed — `handlesFromLinks` decomposes on the way in, and a URL it cannot
decompose is shown as itself rather than vanishing.

## Permissive on purpose

We are not verifying accounts exist, and **a regex stricter than the platform's
refuses real people with no way around it**. So:

- Letters, digits, dots, underscores, hyphens — wider than any one platform.
- A leading `@`, a pasted full URL, a trailing slash and surrounding whitespace
  are all cleaned rather than refused. People really type all four.
- Bluesky handles are domains, so dots are normal there, not suspicious.
- Only things that genuinely cannot sit in a URL path are refused: spaces, `/`,
  `?`, `#`.
- The message says what **is** allowed, never "invalid".

A handle that 404s on TikTok is the member's to notice. A handle we refused is
our bug.

## Failures are legible now

Three changes, each addressing a different way the old failure was opaque:

1. **Per platform, not per save.** `linksFromHandles` reports a problem against
   the field that caused it; one bad handle no longer fails everything.
2. **Caught before the round trip**, so the message arrives with the field.
3. **Handler messages pass through verbatim** rather than becoming "something
   went wrong" — shipped in the previous merge.

## Also in this merge

**The owner can change their Page photo.** `PagePhotoPicker` was built for the
composer and had no second caller; it is a drop-in here.

## What is still not editable, and why

**Physical address** — the composer picks from available locations or creates
one inline, and extracting that picker is a larger change than this merge. Named
rather than silently missing.

**Category is retired**, not missing: `resolve-shop.ts` records that categories
were retired at T159 and nothing writes `groups.category`. Adding a category
field would resurrect a dead concept. The handler accepts the column so the
capability survives if Don rules it back.

## Checks

`tsc` clean · build passes · conformance clean · 206 tests, 23 of them on the
handle rules including every input Don tried.
