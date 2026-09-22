# F076 · T168 · The panel takes an email instead of sending you to sign in

Issue #194. Scenario F076 criteria 13-15, under the count ruling in #196.

## What it replaces

`MetroNotCoveredPanel`'s signed-out branch was a dead end it admitted to in its
own comment: the waitlist needed an account, so the control routed to
`/auth/login`. Signed out is the common case on that surface — someone who just
found their own city in the scope sheet has no reason to have an account yet,
and being sent to make one is the step they came to avoid.

## Built

The `!signedIn` branch now renders the same two role radios plus an email field
and submits through `joinMetroWaitlistAnonymousAction` (T167, #197). Signing up
stays reachable underneath as an option, never as the gate.

`MetroStandingDialog`'s `combined`/`target` became optional, and **omitted is a
real case rather than a fallback**. Both or neither: a half-supplied pair could
only render something misleading, and silently dropping one is how a count
comes back by accident.

The panel names the two dialog fields rather than spreading the action's
result into it. Spreading would be the bug — the anonymous result has no count
today, and the first time someone adds a field to it the popup would start
rendering one.

## The tests that matter

- the signed-out branch renders an email field and **no** `waitlist-signin` —
  the dead end is asserted gone, not merely replaced
- the popup's entire `textContent` **contains no digit**. That single assertion
  is the whole of #196 at the surface: a count, a target, "12 of 300", or a
  number worked into the copy all fail it
- the popup renders exactly `metroName + message + "Got it"` and nothing else,
  so the component cannot add a tell of its own to what the action returned
- the signed-in path is asserted **unchanged** and still shows 50 of 300 — a
  member is entitled to see themselves counted
- no password field, no name field, neither role pre-selected
- a refusal is asserted not to say "already", "exists", "known" or "listed"

## Verified

Full suite: **2444 passed**, one flake (see below). Lint 0 errors.
`npx tsc --noEmit` clean.

`src/lib/migrations/manifest.test.ts` timed out at 5929ms against a 5000ms
limit under parallel load and passes alone in 4.4s. Second time today — it
shells out to tsx and the subprocess start is what blows the budget. Raised as
its own chore; nothing to do with this ticket, which touches no migrations.

Don looks at this one on the preview — it is a new member-facing surface and
criteria 9, 14 and 15 all constrain its copy.
