# Signed out is read-only

*2026-09-18. Don's ruling. Supersedes the per-poster visibility toggle, which this makes unnecessary.*

## The rule

**Signed-out Explore is a display of what's around** — public Pages, their public
content, the map. **Anything that touches another person requires an account:**
follow, get-updates, support, report, respond, message.

## Why reporting is inside the wall, in Don's words

Requiring an account **buys no identity**. He has already ruled that
accountability here is visibility and peer pressure, not verification
(2026-09-14), and this does not reopen that. **It buys continuity.** An account
is persistent, rate-limitable and revocable; an anonymous reporter is none of
those. The target is making repeated abuse expensive, not knowing who anyone is.

**This introduces no verification and changes no names rule.** A signed-in
person is exactly as pseudonymous as before.

## One gate, not a check per control

`src/lib/auth/requires-account.ts` names every gated action in one list, with
its prompt copy beside it. A gate re-implemented at each call site is a gate
with a hole in it — the next control ships without one and nobody notices,
because nothing was removed. A test asserts the list is the whole list.

The copy says what the account is *for*. "Sign in to continue" is a demand;
these are reasons. The report prompt says outright: *"An account lets us slow
down someone reporting the same business over and over. It is not an identity
check."* A test asserts no prompt makes an affirmative verification claim.

## Deferred registration — the tap is not lost

`signInHref(action, path)` carries **both** the path and the intent, so a
signed-out person taps the affordance, signs in, and lands back where they were
with the action ready to finish. A prompt that discards the action trains people
not to tap.

`parseIntent` refuses anything not on the list — the intent decides what runs
after sign-in and it arrives from a URL.

## The caps that do the actual work

Report-bombing a business is the risk Don named, and these do more than any
identity check would:

- **20 open reports per account** — refused, not merely un-hidden.
- **2 reports on the same Page by the same account** — the third is refused.

The cap that already existed only withheld the auto-hide; the report was still
stored, so an unbounded reporter could still fill the operator's queue. These
refuse **before the insert**, because a report nobody will read is still a row
in that queue. Both sit well above ordinary use — 20 open reports is not good
faith.

**Reversible on purpose:** constants in code, not schema. A threshold in the
database is a migration and a production apply; a threshold here is one edit.

## The disclosure question this closes

There is no signed-out personal content to leak, because there is none to
withhold. The boundary is server-side and always was: every handler requires a
signed-in member, so the client gate is a courtesy and a direct call with the
button hidden is refused regardless of what renders.

## Checks

`tsc` clean · build passes · 39 report tests · 12 gate tests.
