# F070 — a Page carries its links out

**Kind:** scenario work. **Ruling:** `ops-pattern/DECISIONS.md` 2026-09-16 —
controls belong to the Page kind.

## MIGRATION PENDING — this must not merge first

`20260917001314_group_social_links.sql` adds `groups.social_links`. The read
path selects that column and the handler writes it, so **merging before the
migration runs breaks Page reads**, which currently work. Apply first, merge
second. Instructions in the PR.

## Which kinds carry links, and why

Not all of them. Source of truth is `product/systems/page-kind-tools.md`
§ The mapping, which is ratified — this mirrors it rather than deciding.

**`family` is the one ✕.** It is "the community set minus discoverability… every
tool it loses, it loses because nobody outside can see it". A links-out control
on a surface nobody outside can see is meaningless, and a family roster is the
last place to invite a public profile link.

Every other kind — `business`, `place`, `interest`, `practice`,
`event_anchored` — carries them.

**Social links are not yet a row in that table.** Adding one is Don's call. The
✕/● pattern above is proposed, not ratified, and the PR says so.

## A correction to what I merged earlier

`kind-controls.ts`, shipped in the map rewire, had `interest` and `practice`
carrying **no** address and **no** map pin. That contradicts the ratified
mapping, whose Location anchor row is ● for `place`, `interest`, `practice`,
`event_anchored` and `business`, and ✕ for `family` alone. A run club meets
somewhere. Corrected here, with the map test corrected alongside it — it was
asserting the wrong behaviour confidently.

## The column, and why jsonb

One `jsonb` column, `{platform: https-url}`. Precedent: `locations.ambient_extras`.

- **Not a table:** the set is small, bounded, always read with the Page, never
  queried across Pages. A join on every Page render to answer a question nobody
  asks of the set.
- **Not a column per platform:** every new platform becomes a migration, and the
  platform list is exactly what changes without warning.

**Three CHECK constraints, and they are not decoration.** This column is
rendered into `href` on a public Page, so an unsafe value is an XSS vector
wearing a platform label. The constraints refuse anything that is not a flat
object, on a closed platform key set, whose every value matches
`^https://[^\s]{1,500}$`. Plain `http` is refused too — a link the platform
hands a member should not downgrade their connection.

## Validated three times, deliberately

The database refuses, `social-links.ts` explains, and the composer says so
before submit. **And `socialLinksForDisplay` re-checks on read** — a row written
before the constraint existed, or by anything that bypassed the action layer,
must not reach an `href` unchecked.

## Verification

`tsc` clean · lint 0 errors (31 pre-existing warnings) · build succeeds · full
suite **1996 passed**, 13 failures all the local-DB "cannot run" gate.

38 new tests. Three existing tests needed updating and all three were asserting
things this change makes false: the map's kind filter (the correction above) and
two `SellWalkthrough` argument-shape assertions now carrying `socialLinks`.

**Not verified:** anything against a real database. The migration has not run,
so the column does not exist anywhere yet. The SQL has static shape tests; the
constraints have never refused an actual row.
