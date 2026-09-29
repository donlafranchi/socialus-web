### bug #241, part 2 of 2 — a public Page does not hand a stranger the member ids behind it

**Confirmed on production 2026-09-29** with `scripts/probe-anon-identity.sh`, which uses the key from our own served JavaScript and prints counts only: the membership view returned 13 (member, Page) rows for 6 Page slugs; `groups.founder_member_id` gave 4 founder ids; 8 of 10 ids resolved to a readable `members` row. The 2026-09-21 ruling had called the second route inferred, not confirmed.

- `member_public_group_memberships`: `anon` loses SELECT. Signed-in readers keep it (`/you/following` counts from it).
- `groups`: `anon`'s SELECT is rebuilt as every column but `founder_member_id`. A column added later is not visible to `anon` until granted; a test fails on that before a signed-out Page does.
- `page_posts_select_own` is scoped to `authenticated`. Its subquery reads `founder_member_id` with the caller's privileges and would otherwise refuse `anon` every read of `page_posts`. Seen refusing, then passing. The `groups` policies read the column in their own quals, which Postgres does not check against column grants, so they stay as they were (checked).

- `memberships_select_listed_group` is scoped to `authenticated` (route 3, found the same day). `014` made listed-Page rosters public to `anon` on purpose; Don's 2026-09-14 rule, that no name is reachable by browsing and no roster may be accumulated, is newer and wins. No signed-out read in the app uses it. Only the role changes (`alter policy … to authenticated`); the qual is untouched. Production before: 10 distinct member ids readable. Test seen failing, then passing.

**Requires part 1 live**; otherwise `resolveShop`'s old founder embed fails for every stranger. Anonymous half only: signed-in members can still take both routes (#241).

Tests: 7 more in `tests/member-identity-anon-db.test.ts` against Postgres 17.6.1.166, the two leak checks seen failing first. `scripts/probe-anon-identity.sh` exits 1 against production today and should exit 0 once applied. **Migration: `20260929170100_member_identity_not_anon.sql`.**
