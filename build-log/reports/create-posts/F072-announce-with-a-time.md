# F072: a Page owner announces something, with a time on it

category: create-posts (no F072 Issue carries an `area:` label; closest picked) · as-of: 2026-10-10 · scenario approved 2026-09-21 (amended to 2026-10-05) · tickets: #114/T164, #179/T166, #256/T175, #262/T179, plus #185, #211, #318 · PRs: #115, #183, #258, #263, #186, #212, #218
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior**, **invariant** ("never / no / nothing": needs a standing guard), **coverage**, **external**.

## Roll-up

| | built | checked |
|---|---|---|
| 6 criteria | 4 | 0 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a guards marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **2 (14-day expiry, "Earlier", show-until; #314 open)** and **6 (alt text on the Page photo; #596)**. Spec conflict: **1 (delete)**. Built means code on main [V]; shipped means `Database reachable from the deployment` success on the merge commit for #183, #258, #263 [V], none returned for #115; reviewed means a `Reviewed by:` section, and #115, #183, #258, #263 carry only `human-review` [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Only the managing role announces or edits; edit in place; deleting refused | behavior + invariant | yes, except delete | `requireManagingRole` via `managingRoleForKind`; edit keeps the row id [V post.ts]. **`group.post_delete` exists (soft delete, #318, Don 2026-10-02)**, so "deleting is refused" is no longer true; the scenario is not amended | unmarked: `post.test.ts`, `PagePosts.test.tsx` | unknown | no |
| 2 | Appears on Page and in browse as the Page's voice (no price, buy, listing chrome); past start drops out; undated leaves after 14 days to "Earlier", optional show-until, "Posted <date>" | behavior + invariant | **no** | Past-dated drop-out and "Posted <date>" on cards built (`browse_feed`, #258) [V]. **Missing: 14-day expiry, "Earlier" section, show-until** (`browse_feed` lets `starts_at is null` through forever [V migration]). Open #314. No-price/no-chrome: nothing asserts it | unmarked: `tests/migrations-browse-feed.test.ts` (drop-out) | unknown | no |
| 3 | Optional date/time and own address; windowed read to the hour; undated never windowed; metro time | behavior | yes | `starts_at`, `location_id` written (#183); `metro-time.ts` is the one zone, constant until #173 [V]; card lead in metro time (#258) | unmarked: `metro-time.test.ts`, `post.test.ts`, `tests/announcement-card-db.test.ts` | unknown | no |
| 4 | One audience switch, default anyone; words name people; no "announcement"/"bulletin" in a label; count in words at zero | behavior + invariant | yes | `AudienceSwitch.tsx`: "Anyone", "Nobody yet" at zero [V]; restricted setting visible, not postable (delivery cut) | unmarked: `PagePosts.test.tsx` (label test at :284; one component only) | unknown | no |
| 5 | A failed save leaves nothing behind | invariant | yes | Place made before the post; insert in one transaction [V post.ts, build log] | unmarked: `PagePosts.test.tsx:246`, `tests/page-post-db.test.ts` rollback | unknown | no |
| 6 | Optional end time after start; add-to-calendar; default alt text from title, date, place; label "Event" | behavior | **no** | End time `ends_at` with check constraint (#263), `.ics` with `DTEND`, `AddToCalendarLink` on posts and gatherings, card alt via `cardImageAlt` [V]. **Missing: the Page's announcement photo uses the body text as alt** (`PagePosts.tsx:496`). Ticket #596. Label "Event": not checked [A] | unmarked: `AddToCalendarLink.test.tsx`, `tests/announcement-end-time-db.test.ts` | unknown | no |

Filed: #596 (criterion 6), #599 (check 1-6), #601 (guard 2, 4). Criterion 2's missing half is already open as #314. Scenario has no `gates:`, so no milestone and no `launch-blocking`.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| SPEC-CONFLICT | 1 (delete: scenario says refused, #318 built soft delete) | `scope-scenario`; amend the scenario, `Path: new territory` if not already ruled | amended criterion 1 |
| NOT-BUILT | 2 (#314), 6 (#596) | `build-ticket` | code + check |
| NO-CHECK | 1, 2, 3, 4, 5, 6 (tests exist, none marked) | #599: `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 2 (no price/chrome), 4 (labels) | #601: `build-ticket` | standing guards |
| NOT-REVIEWED | #115, #183, #258, #263 | `review-pr-bundle` | review sections |
| NOT-SMOKED | all | CI: tie smoke to merge commit | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) after the above | closed UAT Issue |

## Next, in order
1. Amend criterion 1 for soft delete. 2. Build #314 (criterion 2). 3. Build #596. 4. #599 and #601. 5. `review-pr-bundle` on the four PRs. 6. Smoke tie-in, then UAT.
