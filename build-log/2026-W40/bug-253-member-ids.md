### bug #253 — who founded, sells or hosts something answers nobody but them

After #249 no member row was readable, but three columns still tied a member to what they made: `groups.founder_member_id` (signed in), `items.member_id` and `item_gatherings.host_member_id` (anyone). Item cards and venue lists still named sellers. Rulings, 2026-09-30: nobody reads anything about a member but what they post on a Page; the front door shows no founder or seller.

- **Columns:** each revoked from `anon` and `authenticated`; SELECT is rebuilt as every column but that one. The four policies that asked them from another table (`page_posts`, `page_tags`, `group_category_suggestions`, `item_events`) go through `current_member_founded_group_ids()` / `current_member_item_ids()`.
- **Owner reads:** own Pages, the sell draft and a member's own profile items go by id through those functions.
- **Cards:** `discoverable_items` keeps `member_id` and `member_display_name` from clients; the locality, venue-nearby and venue-hosted feeds return a null name. A card shows a business's brand label, or no name.
- **Item posted without a Page:** `posted_item_id(handle, kind, id prefix)` resolves it from its URL, and names one item, never a member's list. It names nobody. `post_author_public` is dropped. The handle stays in the URL (open question on #253).

Tests: `tests/member-ids-db.test.ts`, 14 against Postgres 17.6.1.166 built from every migration; 8 seen failing before this migration. The unit tests for the resolvers, own Pages, the sell draft and the card were each seen failing first.

**Migration: `20260930200000_member_ids_not_readable.sql`.** Apply after #249 merges.
