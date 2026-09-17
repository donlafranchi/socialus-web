# The Explore scope control — choosing which area Browse is showing

*2026-09-17. Third and last of the three honesty fixes.*

## What was wrong

Browse named a place and gave you no way to change it. The location pill in the
search row was a `<span>` — display only, by an explicit b1 deviation ("F045
places a location pill in the row but specifies no picker"). The pre-rebuild
selector it replaced read the retired `markets` table, so it was removed and
nothing took its place.

Two fixes had already landed on top of that gap and could not finish the job:

- **The precedence fix** made an explicit request beat a stored default in
  `resolveFeedPlace`, so a scope picker would finally do something. There was no
  scope picker to prove it with.
- **The relabel** stopped the pill asserting "The Good Place" to people who had
  never chosen anywhere, and made it read *Choose your area* instead. Which was
  an instruction to do something the interface did not allow.

So the pill asked a question with no way to answer it. This closes that.

## What it does

The pill is a button. It opens a bottom sheet listing metros in two headed
groups: **Where SocialUs is running**, then **Not covered yet**. Choosing an
open metro sets the scope, writes `?metro=<slug>`, and the pill shows that
metro's real name.

Scope is URL state, like every other Browse filter, so a scoped Browse is
shareable and survives a reload.

## The load-bearing decision: unopened metros are not selectable

296 metros exist and exactly one is open. 295 carry no polygon and no centroid —
the waitlist migration dropped both NOT NULLs deliberately, because a person
*picks* their metro from a list there and nothing geo-resolves an unopened one.

A picker that let you choose any of the 296 would, for 295 of them, change the
label at the top of the page and leave every result underneath exactly where it
was. That is the precise failure the other two fixes were undoing, rebuilt with a
nicer sheet. So the unopened metros are listed — a person should be able to find
their own area and see where it stands — and they are not tappable, under a line
saying plainly that SocialUs isn't running there yet.

`fetchExploreOrigin` enforces the same rule server-side: a hand-typed
`?metro=boise-city-id` resolves to nothing and falls back to the default rather
than relabelling the page.

## What the choice actually changes, stated exactly

The chosen metro becomes the **origin** — its `centroid` from `metro_polygons` is
the point the distance filter measures from and the point "Nearest" sorts by. And
it becomes the **label**.

It does **not** filter results to the metro's polygon. Nothing on Browse does:
`fetchExploreItems` filters on `item_kind` and nothing else, and the radius is
opt-in (`distance` defaults to null). Scoping results to a metro is the Browse
query rewrite, which the curated-lens work needs anyway. With one metro open and
all content inside it, the label is accurate today — but it is a label, and this
entry is the place that says so rather than letting a future reader infer a
filter that isn't there.

## Follow-up, not done here

Choosing an unopened metro should offer its waitlist. The handler and the counts
exist (`waitlist-join`, F076), but the only surface that reaches them is the
onboarding step — there is no standalone route. Wiring one from this sheet is its
own change.

## Checks

- `npx tsc --noEmit` — clean
- `npm run build` — passes with CI placeholder env
- Vitest — 2075 passing. The 13 failures are all `runnable.ts` "cannot run"
  guards for DB-bound suites needing the local Supabase stack; unrelated, and
  they fail identically on a clean `main`.
- New: 6 `ScopeSheet` tests, 3 metro-origin tests, 2 pill-as-button tests, 6
  `metros.ts` tests.
- Updated: the search row's affordance-order test now expects three buttons —
  still "one row, three elements", with the locality as the first of the three
  rather than a label beside two.

## One fix that came with it

`useOverlayOpen.test.ts` never unmounted its React roots — `afterEach` wiped
`document.body.innerHTML` out from under React instead of calling `cleanup()`.
Four roots stayed mounted for the life of the file, the hook's MutationObserver
stayed attached, and the scheduler's queued work fired after the jsdom
environment was torn down: `ReferenceError: window is not defined`, three
unhandled errors, whole CI run red while all 2167 tests passed.

Pre-existing and timing-dependent — the first CI run of this same code passed.
Adding another component suite shifted the schedule enough to expose it. Fixed
here rather than left as a flaky gate, since it was the thing blocking this
merge.
