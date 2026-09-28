# F093 · T172 · One withheld card per Page, with its photo

**Issue:** #215 · **Scenario:** F093, criteria 4, 5 and 9 amended 2026-09-27 (ops-pattern)
**Carries a migration:** yes — `20260927180000_announcements_withheld_per_page.sql`

## Why

Don, on production signed out: the card "looks weird". Two causes, both seen:
- one card per announcement, each carrying the Page's count, so SacRiver
  Floaters rendered twice, both reading "1 announcement this week";
- a bare text box in a grid of photo tiles.

## Built

- **`announcements_withheld` returns one row per Page** and gains `photo_url`
  (null when hidden or removed, resolved in SQL) and `announcement_ids` (ids
  only). Still no body, `starts_at` or location in the return type.
- **Explore card** is tile-shaped: Page photo (or the tile emoji), a count pill
  on the image, the Page name, "The details are for members and followers of
  this Page.", and a **Sign in to become a member** button that returns them to
  the Page after sign-in. No location line — under "3 announcements" it would
  read as where they happen.
- **Page** shows one card, carrying an empty anchor per announcement id, so any
  `#announcement-<id>` link lands on it and rings it.
- **`scripts/probe-anon-announcements.sh`** asks production's PostgREST, with
  the key from the served bundle, for `page_posts` bodies and for any
  `announcements_withheld` column outside an allow-list.

## Verification

- REST suite: 6 new/changed tests watched failing against the previous
  migration, green after. Shape is asserted as an exact allow-list of keys.
- Probe: observed **FAIL** against local with an RLS-bypassing key (4 bodies
  readable); its allow-list filter observed rejecting `body,starts_at`. Against
  production before this migration: **PASS**, 0 rows, 3 cards, no extra columns.
- Full suite 2610 passed after regenerating the migration manifest; `tsc`
  clean; `eslint` 0 errors.
- Looked at locally, signed out: Explore desktop and phone widths, and a Page
  reached through an older announcement's anchor (one card, ringed).

## After the migration is applied

Run `scripts/probe-anon-announcements.sh` again; it must still PASS.
Before it is applied, a preview built from this branch against production
still gets the old one-row-per-announcement shape.
