### change #318 — owners can delete their own posts

Don, 2026-10-02. This replaces F072 acceptance 4 ("no delete") under newer-decision-wins.

- **`group.post_delete`** (managing role only): stamps `page_posts.dissolved_at`. Every reader already filters it (the Page, `browse_feed`, `announcements_withheld`, RLS), so the post is hidden everywhere; the row stays for reports and audit. Appends `group.post_deleted`.
- **On the Page:** Delete beside Edit, for the owner only. It asks first ("Delete this post? It comes off your Page and Explore." with Delete post / Keep it), then takes the post off the Page.
- **Migration** `20261001105000_post_deleted_event.sql`: the new event kind in `group_events`' list, nothing else. Numbered to apply right after builder accounts (#281).

Tests: handler (soft, managing role only, not found) and the confirm flow, seen failing first. The migration was applied to a local database.
