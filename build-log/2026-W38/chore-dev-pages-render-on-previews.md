# chore — verification pages render on previews, and still 404 in production

**Kind:** chore. **Scenario:** none.

## What was wrong

`src/app/(dev)/layout.tsx` gated on `NODE_ENV !== 'development'`. **Every Vercel
build sets `NODE_ENV=production`**, preview and production alike, so every page
under `(dev)` rendered on a laptop and 404'd on every preview.

That is backwards for what these pages are for. They exist to be looked at, and
Don looks at them on his phone, away from the machine. A verification surface
only the person at the keyboard can reach verifies nothing.

## The change

`VERCEL_ENV` is the variable that tells the two apart: `production` | `preview`
| `development`, and unset outside Vercel. The gate now blocks on **equality
with `'production'`**, not inequality with anything — an unset value has to mean
"not production", or `next dev` and a local `next start` stop working.

Extracted to `gate.ts` as a pure function so both directions are testable.

## The half that was missing, and nearly shipped

**Inverting the rule alone would have published every verification page to
production.**

Pages under `(dev)` were statically prerendered (`○` in the build output). The
layout ran once at **build** time, when `VERCEL_ENV` is not the runtime value,
and the resulting HTML was served to everyone regardless. The old gate hid this
by blocking at build time — every build has `NODE_ENV=production`, so the page
was never generated at all.

Caught by testing it rather than reasoning about it: a production-shaped runtime
served `/card-gallery` with **HTTP 200**. `export const dynamic = 'force-dynamic'`
in the layout makes the gate run per request; the route moves from `○` to `ƒ`.

## Verified both ways, in a real runtime

Built the app, then started it twice and asked for the page:

| runtime | `/card-gallery` |
|---|---|
| `VERCEL_ENV=preview` (NODE_ENV=production) | **HTTP 200** |
| `VERCEL_ENV=production` | **HTTP 404** |

7 tests: production blocked, preview allowed, Vercel development allowed, laptop
with no `VERCEL_ENV` allowed, local production build allowed, `'Production'` and
`''` not treated as production, and the `force-dynamic` export asserted so
deleting it fails rather than silently publishing.

## Still true

`(dev)` pages never reach production. What changed is that they now also render
where someone can actually look at them.
