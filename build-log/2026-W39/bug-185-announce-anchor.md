# bug #185 — the Announce button on your own Page scrolls nowhere

**Kind:** bug · **Scenario:** none · **Branch:** `bug-185-announce-anchor`

## What was wrong

`OwnerBar` links its primary **Announce** button to `<page>#announce`. Nothing in
the codebase carried `id="announce"`. The browser resolves an empty fragment to
nothing, silently, so the main call-to-action on an owner's own Page left them
at the top of it.

The composer was reachable by scrolling, so the feature worked. The button
pointing at it did not.

## How it happened

Two literals written three PRs apart. The link landed with #175 on 2026-09-21,
naming a destination that did not exist yet; the composer it names landed with
#179 / PR #183 the same day, under a `data-testid` and no id. Nothing compared
them — a dead fragment is not an error in any tool we run. Found by walking the
F072 journey on production rather than by a check.

## The fix

`announce-anchor.ts` exports `ANNOUNCE_ANCHOR`. Both ends import it, so a rename
moves both or neither. `scroll-mt-20` keeps the heading clear of the header.

## The test

`announce-anchor.test.tsx` resolves the link the way a browser would: renders
the owner bar, splits the fragment out of the real `href`, renders the composer,
and asks the document for that id — then asserts the element it finds actually
contains the composer's textarea. Asserting on the constant alone would pass
with both ends wrong in the same way.

Green: 29 tests across the anchor, owner bar and composer suites.
