# fix — Explore stops naming a place nobody chose

**Kind:** bug. **Scenario:** none.

## The bug

Explore's location pill printed the resolved place's display name
unconditionally. With nothing chosen that name is **"The Good Place"** — the
seeded launch locality standing in for the IP geolocation deferred at b1 — so
the pill asserted a locality to a person who had never named one.

That is Don's *"I have the good place and can't change it."*

## The bigger half, found while fixing it

It is not only a display fallback. `onboarding/actions.ts` writes The Good Place
into **every new Member's `primary_home`**, and says so:

> *"default the Member's primary_home to The Good Place. The locality write is
> invisible to the Member — there is no picker."*

So a signed-in member's *stored* place is the stand-in too. Testing
`source !== 'default'` would have called that a choice and named it — the same
lie by a longer route. `chosen` therefore also excludes the launch slug
whatever the source: **a place assigned without a picker is not a choice.**

## The fix

`ExploreOrigin` carries `chosen`. `placePillLabel()` names the place when
someone picked it and otherwise says **"Choose your area"** — plain words, no
invented locality, and styled as a prompt rather than a settled fact.

**"Nearby" is gone too.** It was the old fallback and it was also a claim: with
nothing resolved, the surface does not know the reader is near anything.

## What this means today

Until the Explore scope control lands, `fetchExploreOrigin` calls
`resolveFeedPlace` with **no options at all**, so every visitor takes the
default path and the pill reads "Choose your area" for everyone. That is
accurate — nobody can choose yet. It becomes a real locality name when item 3
ships.

## Three tests asserted the old behaviour

- *"falls back to a neutral label"* expected **"Nearby"** — a claim dressed as
  neutrality.
- *"carries the locality"* expected **"West Sacramento"** to be named, on a
  fixture whose slug was `the-good-place`. The fixture was the stand-in wearing
  a friendly name, so the test asserted that the stand-in gets named.
- A third expected "Nearby" when nothing resolved.

All three updated, and the fixture given a real non-launch slug so it tests the
chosen path rather than the assigned one.

## Verification

6 new tests on the label, plus a case asserting the launch stand-in is never
printed. `tsc` clean · lint 0 errors · build succeeds · 222 tests across
`ExplorePage`, `components/explore` and `lib/explore`.

## Not fixed here

Onboarding still assigns The Good Place invisibly. Stopping that is a change to
what onboarding does, not to what Explore says, and it wants the scope control
to exist first so there is something to assign instead.
