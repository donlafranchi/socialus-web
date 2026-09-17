# change — Home is paused

**Kind:** change. **Scenario:** none. Don's ruling, 2026-09-17.
**Paused, not deleted.** The decision about Home's future is deferred.

## What changed

- **`/` redirects to `/explore`.** Nobody lands on a surface we have stopped
  maintaining.
- **Home is out of the nav.** Two tabs now: Explore, You.
- **Create moved from after the second tab to after the first.** With two tabs,
  leaving `CREATE_AFTER = 2` parks it on the right-hand end — a different claim
  from "Create sits between the destinations", which is the bet about declaring
  things being first class.
- Two browse CTAs that pointed at `/` now point at `/explore` directly. The
  desktop wordmark still points at `/`; it redirects, and a wordmark pointing
  home is conventional.

## What was deliberately NOT deleted

`LocalityFeed`, `ScopePicker`, `MakeThisYoursBanner`, `FeedEmptyState`,
`src/lib/feed/locality-feed.ts` and the `locality_feed_items` RPC (migration
027) are all untouched. They carry the only place-scoping and interest-ordering
in the app and that capability is likely moving to Explore. Deleting it would
mean rebuilding it.

## The onboarding link — and a correction

The brief said `MakeThisYoursBanner` is the only link to `/onboarding`. It is
the only **visible** one, but the route was never orphaned:
`EmailFirstSignup` and `auth/password` both default their post-auth `next` to
`/onboarding`, so **everyone arriving through signup still lands there**.

What was missing is a way **back** for someone already past signup who skipped
or abandoned it. That is now a row in `/you` → Settings → **Profile**, reading
"Your name and where you are".

Worded as a destination, not "finish setting up": **there is no completion flag
on a Member.** Onboarding writes a display name and a home locality and nothing
that says "done", so telling someone they are unfinished would be a guess.

## Verification

`tsc` clean · lint 0 errors · build succeeds · 617 tests across `src/components`
and `src/app`.

Ten `BottomNav` tests asserted a three-tab bar including Home; they now assert
two. One assumed the suite's default pathname `/` made a tab active — nothing
matches `/` any more, and nothing should, since `/` redirects. Made explicit
rather than left to a default.
