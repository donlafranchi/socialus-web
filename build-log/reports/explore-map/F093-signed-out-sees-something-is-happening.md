# F093: a signed-out visitor sees that something is happening, and is asked in to read it

category: explore-map (no F093 Issue carries an `area:` label; closest is explore-map, as #335 has) · as-of: 2026-10-10 · scenario approved 2026-09-23 (amended to 2026-09-30) · gates: launch · tickets: #215, #252 (both closed), open follow-up #335, check #630, guard #631 · PRs: #218, #230, #255, #259 (also #229, #243 markers)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior**, **invariant** ("never / no / nothing": needs a standing guard), **coverage**, **external**.

## Roll-up

| | built | checked (marked, whole criterion) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 12 criteria | 10 | 4 (1, 2, 3, 7) | 0 | 11 of 12 | 0 | 0 |

Not built: **4** (the kind's default art; #335 open). Unknown: **12**. Built means code on main plus a build-log line [V]; shipped means Deploy health success on 75c682a8, 19109a1e, a7814ce9 [V]; 73625848 (no pins) shows CI and migrations success but no Deploy health run [V], so it counts as shipped-unknown. No PR of the four carries `Reviewed by:` or `review-skipped` (all predate the 10-05 rule) [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Anonymous PostgREST call returns no body | behavior + invariant | yes | `page_posts_select_published` is `to authenticated` (#218); `announcements_withheld` return type has no body [V] | yes (`announcements-signed-out-rest.test.ts`, seen failing first per build log; `probe-anon-announcements.sh` observed FAIL locally) | unknown | no |
| 2 | Same for `starts_at`, `location_id` and later columns | invariant | yes | Same policy; exact-key allow-list on the projection [V] | yes (marked `F093.2`; later columns by the F093.3 allow-list) | unknown | no |
| 3 | Withholding is enforced in SQL, a projection not a filter | invariant | yes | Return type is id, name, photo, count, ids [V migration 20261001100000] | yes (allow-list of keys) | unknown | no |
| 4 | Card has exactly five things; no-photo shows the kind's default art | behavior + invariant | **no** | Five things built: photo, name, count, details line, CTA; no location line [V]. **Missing: the Page kind.** `announcements_withheld` does not return it and the mapper sets `groupKind: ''`, so the art is generic. Open #335 | no: only partial markers; card unit test unmarked: `WithheldAnnouncementCard.test.tsx`. #630 | unknown | no |
| 5 | One card per Page, count named as a period, no nought | behavior | yes | One row per Page (#230); "N posts this week"; zero reads "A new post" [V] | no: partial markers only; unmarked: `withheld-copy` / card test. #630 | unknown | no |
| 6 | A signed-in member sees no change | invariant | unknown | Policy `to authenticated` leaves `using` unchanged [V build log]; no before/after comparison found | no: two partial markers (member reads a body; Explore load) | unknown | no. #631 |
| 7 | Signed-out Explore still has post-kind rows, withheld | behavior | yes | `getWithheldAnnouncements` merged into Explore (#218) [V] | yes (`load-withheld.test.ts`, `F093.7`) | unknown | no |
| 8 | Signed-out front door: name, default photo, description, card; no location, tags or founder; indexable | behavior + invariant | yes | `anon` loses `locations`, `anchor_location_id`, `page_tags`, `tags` (#255); no pin (#259); `robots.ts` admits search crawlers [V]. Card ask is placeholder copy [public-is-draft] | no: `front-door-db.test.ts` is marked partial (database half); two unqualified markers on parts only. #631 | unknown | no |
| 9 | Any `#announcement-<id>` link lands on the Page's one card, marked, with CTA | behavior | yes | `WithheldPagePosts` carries an anchor per id (#230); DB returns all ids [V] | no: DB half marked partial; render half unmarked: `WithheldPagePosts.test.tsx`. #630 | unknown | no |
| 10 | No link to a body signed out; the ask comes first | invariant | yes | CTA is its own link to `/auth/login?next=<Page>`; the card link goes to the Page only [V] | no: unmarked: `WithheldAnnouncementCard.test.tsx` ("links to the Page's withheld card"). #630 | unknown | no |
| 11 | Same card for every anonymous reader | invariant | yes | No per-viewer input found in the withheld read path [V grep] | no: unit test "is the same for every anonymous reader" unmarked. #631 | unknown | no |
| 12 | Every criterion has a check seen failing | coverage | unknown | Build logs record fail-first for criteria 1, 3, 4, 8 and the probe; none recorded for 5, 6, 9, 10, 11. The probe script is not run by CI [V workflows] | no | unknown | no |

Smoked: latest `smoke-live` runs (2026-10-10) all failed and belong to other commits; none ties to an F093 commit [V].

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 4 (kind default art) | `build-ticket` on #335 | code + migration + check |
| NO-CHECK (built, nothing asserts it) | 4, 5, 9, 10 | `build-ticket` on #630 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 6, 8, 11 | `build-ticket` on #631 | standing guards |
| NOT-REVIEWED | all four PRs | `review-pr-bundle` | a review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit; cover Explore and a Page signed out | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are clear | closed UAT Issue |

Filed 2026-10-10: #630 (check 4, 5, 9, 10; launch-blocking, Beta 11-06), #631 (guard 6, 8, 11; launch-blocking, Beta 11-06). Criterion 4 not-built is covered by open #335 (not refiled). Criterion 12 is not filed.

## Next, in order
1. #335 (criterion 4 default art). 2. #630 and #631. 3. Review the four PRs. 4. Smoke tied to commit. 5. UAT Issue.
