### bug #246 — nobody reads another member

**Don, 2026-09-30, on #246:** a signed-in stranger reads no member field; a Page's creator may show a display name and avatar on it. Nobody sees who follows whom; a Page's owner sees their Page's followers. Interest tags are not public. A stranger does not see a Page's roster. Refined the same day: whoever is party to an RSVP sees it; an RSVP to a group Page's gathering puts you inside the group, one to a business Page's joins that post only; business Pages have no members; purchases are deferred; the front door shows no founder or seller.

Production, 2026-09-30, counts from `scripts/probe-member-reads.sh`: signed out reads 8 member rows, 10 follows, 16 interest tags, 34 responses, 6 location owners, and three member projections; a signed-in stranger reads 11 member rows and 13 roster rows besides.

- **`members`:** one policy, your own row. The #178 anon read of `public` members goes too (newer ruling).
- **Profile:** `resolve_member_page_visibility` renders for the owner only; `member_public_pages` lists your own Pages only.
- **Founder on a Page:** `page_founder_public` keeps its signature: display name only, to the Page's members and whoever is inside through an RSVP; nobody on the front door.
- **Item posted without a Page:** `post_author_public(handle)` names its poster, only for a handle that has posted. The name no longer links.
- **Follows, interests:** readable by the member who made them. Page followers: owner only, as before.
- **Roster:** the listed-Page policy is dropped; the co-member policy no longer counts a follow as membership, and on a business Page only whoever runs it reads the roster.
- **Responses:** RSVPs by party: anyone with a live RSVP on an item sees the other live ones; its organiser (poster, host, Page runner) sees all. Purchases, pledges and the rest: the responder only.
- **Inside the house:** `current_member_rsvp_group_ids()` (a live RSVP on a group gathering) joins the roster, `groups`, `items` and `group_events` member reads. Withdrawing the RSVP leaves.
- **`locations.member_id`:** column-revoked; `own_locations()` for the sell flow; `location_events` asks through a function.
- **Projections:** `member_public_group_memberships`, `member_public_discoverability`, `member_has_standing_presence`, `member_public_has_published` answer nobody. `/you/following` counts via `page_listed_member_counts`. `venue_hosted_items` runs as its owner with items visibility written out.

Tests: `tests/member-reads-db.test.ts`, 37 against Postgres 17.6.1.166 built from every migration; 28 seen failing before this migration, each refinement's tests also seen failing against the version before it, 37 passing after. Three #241/F067/#178 tests that asserted the replaced behavior are updated.

**Not built, escalated on #246:** dropping location and tags from the signed-out front door (conflicts with approved F093 criterion 8); "only what the owner makes visible to the MSA" for signed-in non-members (no such setting beyond the announcement switch); a private group's front door (merged ruling says signed out gets nothing). Merged 2026-09-30 DECISIONS lines on the founder and on RSVPs are superseded by the corrections and need pruning in ops-pattern.

**Migration: `20260930180000_member_reads_self_only.sql`.**
