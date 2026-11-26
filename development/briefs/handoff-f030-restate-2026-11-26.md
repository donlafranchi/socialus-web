# Handoff to planning: restate F030 (newcomer signs up)

*From the socialus-web build session, 2026-11-26. For the socialus-plan session.*

## What changed in code
- The old home locality feed and its "Make this yours" banner are gone (the PM, 2026-11-12; socialus-web #1301 / PR #1302).
- The dead feed pieces left behind were removed (#1363 / PR #1440, merged 2026-11-25): the empty-feed card with its "widen the locality" link, the scope picker, and the locality feed reads.
- Three F030 browser tests were retired with them. All three had been switched off (quarantined) since the feed left:
  - AC1: an anonymous visitor sees a locality feed with "Make this yours" and a scope picker.
  - AC4: an empty locality offers a one-tap widen.
  - AC2 + AC3: sign-up with email and password, then onboarding, then land on the feed.
- Still live and tested: a returning member enters their email, is recognised, and signs in.

## What planning needs to do
1. **Restate F030 AC1.** It describes the removed feed, banner and scope picker. Signed out, a visitor now reads what a signed-in stranger reads (F134), and every write asks for sign-in first.
2. **Retire or restate AC4** (empty-state widen). That control no longer exists.
3. **Restate AC2 + AC3 to end where onboarding ends today, and ask for a browser test of it.**
   - Today's onboarding is one screen (legal name, display name, zip, 18+ box), then "your metro", then an optional interests step.
   - The retired test was the only browser-level check of sign-up through onboarding. Only unit tests remain.
   - The eval helper for password sign-up still exists, unused (`evals/helpers/auth.ts`, `signUpWithPassword`).
4. Once the scenario changes, code tickets the new eval against it.

## Open question for planning
- Where does a newly onboarded member land now that the home feed is gone? The retired test expected the old feed at `/`. The restated AC3 should name the destination.
