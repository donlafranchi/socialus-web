### bug #241, part 1 of 2 — the reads a signed-out page needs, without a member id

**Two routes hand a stranger the member ids behind a public Page** (#241): the membership view asked by slug, and `groups.founder_member_id`. Both confirmed on production 2026-09-29. Part 2 takes both away from `anon`. This part moves the two signed-out reads that depend on them first, because the repo applies a migration before merging it: revoking under today's code would fail `resolveShop`'s founder embed for every stranger and 404 every Page until the merge.

- **`member_public_pages(member_id)`**: a member's Pages, one direction only. `/m/<handle>` reads it instead of the view.
- **`page_founder_public(group_id)`**: "Founded by" as handle, name, avatar and has-published, with no id. `resolveShop` reads it instead of embedding through `founder_member_id`. It admits exactly who could see the Page and the founder before: a stranger sees a `public` founder of a listed Page.

Additive only: safe to apply before or after the merge. Tests: 3 against Postgres 17.6.1.166 (production's build), each seen failing on a missing function first; `resolveShop`/`resolveMemberPage` unit tests assert neither reads the old route. **Migration: `20260929170000_member_identity_reads.sql`.**
