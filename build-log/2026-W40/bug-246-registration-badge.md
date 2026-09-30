### bug #246 — a business registration is collected and never displayed

**Don, 2026-09-29:** registration details are collected but never displayed; they exist to drive a badge. `024` had made `member_business_jurisdictions` public on purpose, "the Group surface renders the claim". What it rendered was one badge, "Claimed local owner", but computing it let any stranger read the member id, zip, state and legal entity name behind it. Production, 2026-09-29: all four readable anonymously, 2 rows.

- **Table:** `anon` loses SELECT. `mbj_select_public_active` is replaced by `mbj_select_own`: a signed-in member reads their own active rows, nobody else reads any. The owner's claim widget still shows the owner their own zip.
- **Badge:** `page_local_owner_badge(group_id) returns boolean`: true when any active registration's zip is in the anchor Location's metro, which is the test the app ran before. The return type can carry nothing else, so no caller and no later edit to its body can un-withhold a column. `resolveLocalOwnerBadge` calls it and no longer reads the table.
- Safe to apply before the merge: old code reading the table as a stranger gets an error and shows no badge until the new code is live. Nothing 404s.

Tests: `tests/registration-badge-db.test.ts`, 5 against Postgres 17.6.1.166, 4 seen failing first. Unit tests assert the resolver never reads the table. `scripts/probe-anon-registration.sh` exits 1 against production today (details readable, no badge function) and should exit 0 once applied.

The scratch database's `auth.uid()` was the bare image's, which reads only `request.jwt.claim.sub`. With the current definition, the three owner-side DB tests that failed locally throughout #241 pass. They were scratch artifacts, not faults.

**Migration: `20260930090000_registration_never_displayed.sql`.**
