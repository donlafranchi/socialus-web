# fix — the scope picker does something

**Kind:** bug. **Scenario:** none.

## The bug

`resolveFeedPlace` read the member's stored `primary_home` **before** the
requested slug. A member with a stored place could tap the scope picker and
nothing happened: the resolver returned the stored value and discarded the
request.

**Our own code named it.** `feed-metro.ts` carried the line *"This inverts
`resolveFeedPlace`, which returns on the stored value before it reads the
requested one — the reason the shipped scope picker does nothing."* It is also
Don's *"I have the good place, can't change it."*

## The fix

Precedence is now **requested → stored → default**, matching
`resolveFeedMetro`, which had it right all along. The rule, stated once in the
file: **an explicit act by a person beats a stored default.**

A requested slug that resolves to nothing falls through to the stored place
rather than stranding the member on an empty surface.

## `source`, which the next fix needs

`FeedPlace` now carries `source: 'requested' | 'member' | 'default'`.

`default` means **nobody chose this** — the launch locality standing in for the
IP geolocation deferred at b1. A surface must not present that as the member's
place, which is exactly what naming "The Good Place" does today. That is item 2
and this is the hook it needs.

## Also

`feed-metro.ts`'s comment described the old broken state as current. Updated —
a comment that accurately described a bug becomes a lie the moment the bug is
fixed.

Worth recording: `bySlug` already resolves the duplicate `sacramento` Place rows
deterministically, ranking neighborhood > city > county. The duplicate slugs are
handled here, whatever the underlying data turns out to be.

## A pre-existing test asserted the bug

`tests/feed-place.test.ts` had a case literally named **"prefers the member
primary_home"**, asserting that a stored place beats an explicitly requested
slug. That is the defect written down as the contract — and it is why the bug
survived: the suite was green the whole time, defending it.

Corrected, and split in two so both directions are now pinned: requested beats
stored, and stored is used when nothing was requested. Flagging it rather than
letting a quiet test edit pass in a bug-fix PR.

## Verification

5 new tests covering every branch, including the one that was wrong.
`tsc` clean · lint 0 errors · build succeeds · 86 tests across `src/lib/feed`
and `src/components/feed`.

**Not verified against a live member with a stored place** — the two callers are
`LocalityFeed` (paused with Home) and `lib/explore/origin.ts`, which passes no
options at all. Explore having no scope of its own is item 3.
