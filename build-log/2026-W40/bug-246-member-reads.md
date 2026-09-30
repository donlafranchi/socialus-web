### bug #246 — nobody reads another member

**Don, 2026-09-30, on #246:** a signed-in stranger reads no member field; a Page's creator may show a display name and avatar on it. Nobody sees who follows whom; a Page's owner sees their Page's followers. Interest tags are not public. Group members see who RSVP'd; only a business's owners see who bought. A stranger does not see a Page's roster.

Production, 2026-09-30, counts from `scripts/probe-member-reads.sh`: signed out reads 8 member rows, 10 follows, 16 interest tags, 34 responses, 6 location owners, and three member projections; a signed-in stranger reads 11 member rows and 13 roster rows besides.

- **`members`:** one policy, your own row. The #178 anon read of `public` members goes too (newer ruling).
- **Profile:** `resolve_member_page_visibility` renders for the owner only; `member_public_pages` lists your own Pages only.
- **Creator on a Page:** `page_founder_public` keeps its signature and returns display name and avatar; handle null and has_published false, so "Founded by" is text.
- **Item posted without a Page:** `post_author_public(handle)` names its poster, only for a handle that has posted. The name no longer links.
- **Follows, interests:** readable by the member who made them. Page followers: owner only, as before.
- **Roster:** the listed-Page policy is dropped, and the co-member policy no longer counts a follow as membership.
- **Responses:** one policy per relation: RSVPs on a group Page for its members and runners, purchases for the business's owners, everything else the responder only. A business Page's RSVPs (open cell d) have no policy yet.
- **`locations.member_id`:** column-revoked; `own_locations()` for the sell flow; `location_events` asks through a function.
- **Projections:** `member_public_group_memberships`, `member_public_discoverability`, `member_has_standing_presence`, `member_public_has_published` answer nobody. `/you/following` counts via `page_listed_member_counts`. `venue_hosted_items` runs as its owner with items visibility written out.

Tests: `tests/member-reads-db.test.ts`, 30 against Postgres 17.6.1.166 built from every migration; 23 seen failing before this migration, 30 passing after. Three #241/F067/#178 tests that asserted the replaced behavior are updated.

**Migration: `20260930180000_member_reads_self_only.sql`.**
