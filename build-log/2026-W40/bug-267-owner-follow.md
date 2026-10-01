### bug #267 — an owner's own Page offered to end their ownership

The design review found this by reading the code, 2026-10-01. A Page's owner saw Follow and Report on their own Page. The follow control read "Following", because their own membership row counts. Tapping it ran `group.unfollow`, which soft-left any row the viewer had, including the owner's or steward's, which holds their authority. `group.follow` on that row also rewrote its `relationship`.

- **Reproduced first:** `tests/page-owner-follow-db.test.ts` runs the real handlers against Postgres 17.6.1.166. A business owner and a club steward each unfollowed their own Page, their row was left, and posting as owner was then refused. Following rewrote the owner's row. All 3 tests failed.
- **Fix:**
  - `group.unfollow` and `group.follow` never touch a row whose role is `owner` or `steward`.
  - The Page renders neither the follow control nor the report control for `viewerOwnsPage`.
- `ShopPublicPage` tests for both controls, owner and non-owner, were seen failing first. The T160 "every viewer" test now reads "every viewer but the owner".

No migration.
