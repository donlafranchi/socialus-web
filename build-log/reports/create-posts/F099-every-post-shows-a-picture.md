# F099: every post shows a picture, and every Page can have a Page picture

category: create-posts · as-of: 2026-10-10 · scenario approved 2026-10-05 (no `gates:` field) · tickets: #460 (closed, both halves built) · PRs: #498, #502 (main), #501 (report-decide fix)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior**, **invariant** ("never / no / nothing": needs a standing guard), **coverage**.

## Roll-up

| | built | checked |
|---|---|---|
| 13 criteria | 12 | 11 |

*Roll-up generated from the criterion rows below by `scripts/criteria.py --rewrite-reports`; never typed. Built = the row says yes. Checked = a `[guards F###.N]` marker covers the whole criterion (`markers.py coverage`, the same count as STATUS).*

Not built: **11 (second half: Page picture or placeholder on the signed-out withheld card)**, see Routing. Built means code on main [V migration `20261007290000`, `update.ts`, `PagePosts.tsx`, `BrowseResultCard.tsx`]. Reviewed: PR #498 and #502 bodies carry `Reviewed by: separate reviewer subagent` (#502 also a Visibility review) [V]. Shipped: deploy-health checks, incl. "Migrations applied to production", green on 451bfd71 and af769e15 [V]. Smoked: no smoke-live run on either merge commit; the recent runs fail [V], so 0.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Every Page, any kind, may set one optional Page picture; same flow and copy | behavior | yes | `groups.picture_url`; `group.update`/`update_draft` take `pictureUrl`; "Page picture" picker in `PageEditor` for all kinds [V] | yes (`update.test`, `update-draft.test`, `PageEditor.test`) | unknown | no |
| 2 | No Page picture shows the kind's placeholder, same for everyone | behavior | yes | `DefaultArt` by kind on the Page and the post card [V] | no marker (**#632**) | unknown | no |
| 3 | A post may carry one photo; a second is refused | behavior | yes | `page_posts.photo_url`, single `photoUrl` (never a list) [V build log + code] | yes (`post.test`, `PagePosts.test`) | unknown | no |
| 4 | A post's photo belongs to that post, never becomes the Page's photo | invariant | yes | create touches no `groups` row [V] | yes (`post.test`, create path only; edit is not asserted) | unknown | no |
| 5 | Existing upload path: WebP, stripped, own folder, 5 MB, bytes verified | behavior | yes | `isOwnMediaUrl` on picture and post photo; WebP/5 MB/bytes come from the reused `PagePhotoPicker` and F070 path [A, not re-read] | yes (own folder; the rest is F070's) | unknown | no |
| 6 | Every post card shows exactly one image: post photo, else Page picture, else placeholder | behavior | yes | `browse_feed` resolves it in SQL with `photo_source`; Page cards the same; `/` now redirects to Explore, so Home is Explore [V] | yes (`BrowseResultCard.test`, `PagePosts.test`) | unknown | no |
| 7 | Visible = not hidden, not removed, resolved in SQL; URL never reaches the browser | invariant | yes | SQL `case` on `photo_hidden_at`/`removed_at` and picture equivalents [V]; nothing asserts it, only a one-time Visibility review | no (**#633**) | unknown | no |
| 8 | Each image reportable on its own; hides that one image; notice names which | behavior | yes | `subject_kind` widened to `page_picture`, `post_photo`; `report.create/decide/reverse`; `HiddenPhotoNotice which=` [V] | yes (`report/create.test`, `report-actions.test`, `ReportControl.test`, `HiddenPhotoNotice.test`, `ReportEntry.test`, `PagePosts.test`) | unknown | no |
| 9 | Adding either image shows the sensitive-content ask at upload | behavior | yes | both pickers are `PagePhotoPicker` (F080 ask) [V] | no (marker covers the post photo only) (**#632**) | unknown | no |
| 10 | Every image has alt text: Page name, or the owner's words, else default | behavior | yes | Page picture and placeholder: Page name; post photo: first line of the post; Explore card falls back to the title/when/place default [V]. Whether "owner's words" means the first line is [A] | yes (`BrowseResultCard.test`, `PagePosts.test`) | unknown | no |
| 11 | Signed out: no post photo in any response; Page picture/placeholder where the name shows | invariant | **no** | Half built: `browse_feed` returns no post rows when `auth.uid()` is null [V]. Missing: the withheld card still draws the Page's `photo_url` (`withheld-announcements.ts`), not the Page picture, and F070's placeholder there is open (#335). The scenario also says that card is "unchanged", which conflicts | no (**#633** for the post-photo half) | unknown | no |
| 12 | Removing either image records an event; gone on next load | behavior | yes | `group.update` event payload `fields:['picture_url']`; `group.post_edited` with `photo:'removed'` [V] | yes (`update.test`, `post.test`) | unknown | no |
| 13 | Current Page photo stays; Page picture starts empty | behavior | yes | `photo_url` untouched; `picture_url` new column, null by default [V] | yes (`PageEditor.test`) | unknown | no |

Filed: #632 (check 2, 9), #633 (guard 7, 11). No Gates: none, so no milestone, not launch-blocking; both are well-worn, agent-finishable.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| SPEC-CONFLICT | 11 (withheld card: "unchanged" vs "Page picture or placeholder shows wherever the name does"; #335 open for the placeholder) | `scope-scenario` | one-line scenario ruling |
| NOT-BUILT | none outside 11 | | |
| NO-CHECK | 2, 9 | `build-ticket` on #632 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 7, 11 (post-photo half); 4 on edit | `build-ticket` on #633 | standing guards |
| NOT-SMOKED | all | CI: tie smoke-live to merge commits, cover Explore post cards | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue), after the rows above are clear | closed UAT Issue |

Open risk: removed bytes stay fetchable; the 2026-10-16 purge review (scenario) should settle before post photos reach production [A].

## Next, in order
1. Scenario ruling on 11's withheld card (with #335). 2. #633 guards for 7 and 11. 3. #632 checks for 2 and 9. 4. Smoke tied to merge commits. 5. UAT Issue.
