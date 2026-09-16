# chore — the vendor funnel is deleted

**Kind:** chore. **Scenario:** none. **Closes:** #91, #92, #93, #95.
**Ruling:** `ops-pattern/DECISIONS.md` 2026-09-16 — *"Vendors go. Those are now
absorbed by page types."*

## What went

Routes `/register-vendor`, `/vendors/[slug]`, `/business/[slug]`,
`/you/vendor` and its bulletins. Components `VendorCard`,
`admin/VendorForm`, `BulletinFeedCard`.

Two surfaces had vendor code inside them and were edited rather than deleted:

- **`/you`** — the Saved and Following tabs were vendor lists, and the header
  carried a "Switch to vendor mode" link. Both gone, with the tabs left as
  named empty states rather than vanishing mid-session.
- **`HomeFeed`** — the "From vendors you follow" bulletin section.

## What this confirms about #94

**The vendor-era tables never existed.** `/you` was querying `businesses`,
`follows`, `vendor_categories`, `markets`, `market_vendors` and `supports`;
`HomeFeed` was querying `follows`, `bulletin_mutes` and `vendor_bulletins`.
None are in any migration. Every one of those queries returned nothing, which
is why the tabs and the bulletin section rendered empty rather than erroring.
This is the evidence #94 asked for.

## #119 shrinks, and does not close

Five suppressed react-hooks errors; **two went with `you/vendor/page.tsx`**
(both `react-hooks/purity`). Three remain, none in vendor code:
`src/app/join/page.tsx:33`, `src/hooks/useSupportCount.ts:13`,
`src/components/Map.tsx:115`. Issue updated rather than closed.

## Folded in: a stale session no longer 500s the request

Unrelated to vendors, and small enough to carry here. `src/proxy.ts` called
`supabase.auth.getUser()` bare. Twice in production tonight that threw *Invalid
Refresh Token* — from middleware, which runs on every matched route, so one
expired cookie became a 500 on every page that browser asked for, with no
member-reachable way out. Signed out is a state the app already handles; a
token that will not refresh means signed out, not unserviceable. Both shapes
Supabase uses are handled (a rejected promise and a resolved one carrying
`error`), and an *unexpected* failure is still logged — a failure nothing
reports is how a four-month outage happens.

## What is NOT done, and is bigger than it looks

**`/you` still has vendor-shaped bones.** The Saved and Following tabs are
empty states with nothing behind them; what belongs there is Pages. That is a
design question, not a deletion, and it is not in this PR.

**The map is untouched.** `useMapBusinesses` still queries the non-existent
`businesses` table, and `BusinessDetailCard` was deliberately **restored**
after deletion so the build stays green. Both die in the map rewire, which is
its own PR.

**Controls-belong-to-the-Page-kind is not started.** The ruling's second half
is a design change to how Page kinds carry their own address/map controls.
Retiring the routes is the cheap half; this is not.

## Verification

`tsc` clean · lint 0 errors (29 pre-existing warnings) · build succeeds.
Full suite: 1936 passed, 13 failures all the local-DB "cannot run" gate (no
Supabase on this machine; CI runs them with a real stack).

Two tests needed updating and both are real consequences, not
accommodations:

- `tests/retired-routes.test.ts` — `next.config.ts` still forwarded
  `/business/:slug → /vendors/:slug` and `/register-business → /register-vendor`,
  both now deleted. Repointed to `/explore` and `/you` so links in the wild
  reach something rather than 404.
- `tests/site-metadata.test.ts` — the floor for "how many metadata surfaces
  exist" was 9; the vendor funnel took two with it. Now 7.
