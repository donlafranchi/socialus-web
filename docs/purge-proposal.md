# Purge: deleting a removed photo for good (as built, #491)

*As of 2026-10-11 (rewritten from the 2026-09-17 proposal now that it is built). The filename stays `purge-proposal.md` because an applied migration, a test and code comments cite it.*

Removing a photo is reversible: `photo_removed_at` stops every surface serving it, and the storage object stays. Left alone, a removed photo remained fetchable by anyone holding its direct storage URL. Purge is the second, deliberate act that deletes the bytes.

## What it does

- **Second step only.** An operator can purge a photo that is already removed. Removal first, purge second, so nothing is destroyed in a single tap.
- **Operator only.** The `reports.review` permission (`docs/STAFF-ROLES.md`).
- **Confirmed.** `/admin/reports/purge` asks for a reason (illegal content, person did not agree, not suitable, other; a note is required for other) before it deletes. There is no undo, and the screen does not imply one.
- **Recorded.** `photo_purges` keeps who, what, why and the object path. The row survives the bytes. The Page's `photo_url` is cleared and `photo_purged_at` stamped.

## How (two handlers)

1. `report.purge_target` (`src/actions/report/purge.ts`): checks the photo is removed and not yet purged, and names the storage object.
2. The operator's own session deletes the object. The media bucket has an operator-delete policy (migration `20261007250000_photo_purge.sql`); no service-role key is used.
3. `report.purge`: records the purge and clears the URL.

Deleting the bytes first and recording second means a failure in between leaves a removed photo whose bytes are gone, and the purge can simply be run again. The reverse order could record a deletion that never happened.

## Why the policy route

A service-role key on the server was the alternative. It is forbidden by the action-layer conformance rules, so the bucket policy was chosen instead (the proposal's option 1).

## Not covered

Automated detection, legal reporting duties, retention of purged material for law enforcement, and strikes or bans are separate questions this does not answer. See `socialus-legal` `safety/ncmec-plan.md` for the reporting plan.
