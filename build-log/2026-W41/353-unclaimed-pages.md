### change #353 — real businesses as unclaimed Pages: the mechanics

Don, 2026-10-04 ("full B"). This lands everything a listing needs except the listings themselves.

- **Schema** (`20261005130000_unclaimed_pages.sql`): `groups.unclaimed_at`, `unclaimed_hidden_at`, `public_info_url`, `photo_credit`, `photo_source_url`; a restrictive policy so a hidden one answers nobody; `page_sources` (append-only), `page_removal_requests`, `page_claim_requests`, all server-only; two event kinds.
- **Actions:** `group.unclaimed_remove` hides at once, signed in or out, three per device per day; `group.unclaimed_claim` stores a contact request; `group.unclaimed_restore` is operator-only. The device is a hashed random cookie id, never an address.
- **Page:** "Unclaimed: added from public info" after the name, the picture's and description's credit links, the founder line hidden (it is the system member), and Claim / Remove at the end. `/admin/unclaimed` shows the source log, the requests and Restore. `/unclaimed-demo` (not in production) shows it with invented details.
- **One credited picture, not a logo plus four:** 2026-10-05 ruled one Page picture per Page with a gallery after beta, which is newer than the Issue's guardrail.
- **Not here:** the seed script and the 26 listings (not found in any repo; and the Issue's open question, credit isn't a licence, is Don's), the daily additions, and claiming itself.

Tests: `tests/unclaimed-pages-db.test.ts` through the handlers against Postgres (CI), `UnclaimedBox.test.tsx`, `ShopPublicPage.test.tsx`.
