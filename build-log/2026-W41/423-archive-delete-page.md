# change #423 — Archive and Delete a Page, owner-only

The PM, 2026-10-06: Page settings, last on the Edit Page, with Archive and Delete. Path: well-worn (Facebook Pages unpublish and delete with 14 days of grace; Etsy vacation mode and close shop; Google Business Profile mark closed and remove).

Archive is a new `lifecycle_state`, `archived`; delete reuses `dissolved` plus a new `groups.delete_after`, 14 days on. A restrictive RLS policy hides both from everyone but the founder, joined members included; `group.archive`, `group.delete` (the name typed exactly) and `group.restore` check the managing role. You → your Pages shows them with Restore. `purge_deleted_pages()` removes Pages past `delete_after` with their posts and items; `page-purge.yml` runs it daily once `PAGE_PURGE_ENABLED=true`. Migration `20261006230000_page_archive_delete.sql`.

Tests seen failing first: handlers, the DB visibility and purge suite (a joined member read an archived Page before the policy), the confirm sheet, You's Restore, and an archived Page staying editable.

Revision (the PM, 2026-10-06): a hidden Page goes by who manages it, not who founded it — the restrictive policy now reads `current_member_managing_group_ids()` (definer; owner for a business, steward otherwise), and You → your Pages lists hidden Pages by the same test. Copy: "Archived · Only you can see this" in both places; "Deleted · restore until {date}". The event-kind list carries #353's two kinds, since this applies after 20261005130000/150000/160000. Seen failing first: a non-founder steward and a business owner could not read the archived Page, and the founder who stepped down could.
