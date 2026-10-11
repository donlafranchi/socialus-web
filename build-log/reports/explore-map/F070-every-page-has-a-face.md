# F070: every Page has a face, even without a photo

category: explore-map (the one labelled F070 Issue, #335, carries `area:explore-map`; most of the feature is Page-level) · as-of: 2026-10-10 · scenario building (amended 2026-10-05, F099) · tickets: #10 (closed), #26 (closed), #27 (open), follow-up #335 (open), check #598 · PRs: #121, #127 (links only, not this feature)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **external**, **coverage**.

## Roll-up

| | built | checked |
|---|---|---|
| 5 criteria | 3 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a `[guards F###.N]` marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **4 (signed-out withheld card draws a blank tile, #335)**, **5 (removal and deletion are separate acts)**. Built means code seen on main or a build-log line [V]. Reviewed: PR #121 body has no `Reviewed by:` line and its label is `human-review` [V], so unknown. Shipped: no deploy-health run found for 6190275 (#121) or 1d802f8 [V], so unknown. No `[guards F070.n]` marker exists anywhere in `src` or `tests` [V grep].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | The photo step is optional; composer completes without one | behavior | yes | `PagePhotoPicker` rides in the About step of `SellWalkthrough`; `update_draft` takes `photoUrl` (null clears, undefined leaves alone); a failed upload does not trap the member [V build log t145, files]. #598 | unmarked: `PagePhotoPicker.test.tsx` ("never blocks the step") | unknown | no |
| 2 | Stored bytes carry no metadata, GPS included, verified against the file | invariant | yes | Canvas resize plus WebP re-encode strips it; bucket accepts `image/webp` only (`039_media_bucket.sql`). Missing: a check on an object read back from the bucket. #598 | unmarked: `upload-image.test.ts:112` (real GPS fixture, byte-level, but on pipeline output, not a stored object) | unknown | no |
| 3 | A raw upload that bypasses the client is rejected by the storage API | behavior | yes | Bucket `allowed_mime_types` webp, 5MB limit, insert/update/delete scoped to own `{member_id}/` prefix [V migration]. #598 | unmarked: `tests/media-bucket-storage-api.test.ts` (JPEG, SVG, over 5MB, other member's prefix); runs only when `requireRunnable` passes, CI run unknown | unknown | no |
| 4 | No photo shows the kind's default art, identical for every viewer; missing Page picture falls back to it | behavior | **no** | Built half: `DefaultArt` by kind (shop, service, group) on the Page, browse cards and post cards, with the Page-picture fallback in `PagePosts` [V]. **Missing: the signed-out withheld card draws a plain tile with no icon**, so not identical to every viewer. #335 (open, Beta 11-06) | unmarked: `DefaultArt.test.tsx` | unknown | no |
| 5 | Operator removes a Page's photo in one action; object deleted, event recorded | behavior | **no** | Built half: report-driven reversible removal (`photo_removed_at`) in the admin queue, then a separate `report.purge_target` plus `report.purge` that deletes the object and writes a `photo_purges` row with who, why and when (#491, migration `20261007250000`) [V]. **Missing: one action** (removal keeps the bytes; deletion is a second, deliberate act per `docs/purge-proposal.md`), and the record is a `photo_purges` row, not an event [A]. | no | unknown | no |

Filed: **#598** (check, criteria 1, 2, 3, 4). Criterion 4's build gap is already covered by open **#335**, not refiled. Criterion 5 is a spec conflict, not filed (see Routing). No `gates:` in the scenario, so no milestone and no `launch-blocking`.

Reviewed: PR #121 `human-review` label, no `Reviewed by:` line [V]. Shipped: no deploy-health run found for the merge commits [V]; CI on 6190275: Unit tests and build success, `lint` and `issue-lint` failure [V]. Smoked: `smoke-live` is scheduled, not tied to a commit [A].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (withheld card) | `build-ticket` on #335 | code + check |
| NO-CHECK (built, nothing asserts it) | 1, 2, 3, 4 (tests exist, unmarked) | `build-ticket` on #598 (tests only, seen failing against a mutant) | marked tests |
| INVARIANT-UNPROVEN | none (2 is covered by NO-CHECK: it needs a stored-object assertion) | | |
| SPEC-CONFLICT | 5 (scenario says one action that deletes; the purge ruling made removal reversible and deletion a second act) | `scope-scenario`: amend criterion 5 to match the two-step flow, or build a single delete | scenario decision |
| NOT-REVIEWED | 1 to 4 (#121 no review section) | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. #335 (withheld card art). 2. #598 (mark and complete the checks). 3. `scope-scenario` on criterion 5. 4. Review and smoke rows. 5. UAT Issue.
