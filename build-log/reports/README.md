# Feature reports: roll-up

as-of 2026-10-10 · regenerated whole by the `feature-reports-all-features` run · per-feature detail lives in `<area>/<F###>-<slug>.md`. Counts are criteria; `?` = unknown. **smoked is 0 everywhere**: `smoke-live` is nightly, not tied to a merge commit, and failing on recent main runs. **PM looked is 0 everywhere**: no `uat` Issue closed for any feature.

## Features

| Area | Feature | Criteria | Built | Checked |
|---|---|---|---|---|
| create-posts | [F060 someone starts something without opening a shop](create-posts/F060-start-without-opening-a-shop.md) | 5 | 4 | 0 |
| create-posts | [F061 creating a Page asks one question, its kind](create-posts/F061-create-asks-one-question.md) | 3 | 3 | 0 |
| create-posts | [F064 someone asks for something that isn't built](create-posts/F064-asks-for-what-isnt-built.md) | 5 | 0 | 0 |
| create-posts | [F072 a Page owner announces something, with a time on it](create-posts/F072-announce-with-a-time.md) | 6 | 4 | 0 |
| create-posts | [F074 a series repeats](create-posts/F074-a-series-repeats.md) | 8 | 0 | 0 |
| create-posts | [F082 the rules a member agrees to before publishing a Page](create-posts/F082-rules-before-publish.md) | 9 | 7 | 5 |
| create-posts | [F099 every post shows a picture, and every Page can have a Page p](create-posts/F099-every-post-shows-a-picture.md) | 13 | 12 | 11 |
| explore-map | [F044 newcomer switches between list and map with an inline toggle](explore-map/F044-inline-list-map-toggle.md) | 5 | 2 | 0 |
| explore-map | [F045 a newcomer filters Explore with a filter icon, kind pills an](explore-map/F045-filter-icon-and-sheet.md) | 9 | 2 | 0 |
| explore-map | [F046 scrolling hides the bottom nav](explore-map/F046-scroll-hides-the-bottom-nav.md) | 7 | 6 | 0 |
| explore-map | [F059 Browse, where a newcomer finds the neighbourhood](explore-map/F059-browse-finds-the-neighbourhood.md) | 12 | 9 | 0 |
| explore-map | [F063 someone says they're coming](explore-map/F063-someone-says-theyre-coming.md) | 4 | 0 | 0 |
| explore-map | [F070 every Page has a face, even without a photo](explore-map/F070-every-page-has-a-face.md) | 5 | 3 | 0 |
| explore-map | [F076 a person outside an open metro joins its waitlist](explore-map/F076-metro-waitlist.md) | 16 | 12 | 0 |
| explore-map | [F091 What's happening, today and this week](explore-map/F091-whats-happening-today-and-this-week.md) | 7 | 5 | 3 |
| explore-map | [F092 narrowing happens in a modal that writes what it did](explore-map/F092-narrowing-in-a-modal.md) | 6 | 1 | 0 |
| explore-map | [F093 a signed-out visitor sees that something is happening, and i](explore-map/F093-signed-out-sees-something-is-happening.md) | 12 | 9 | 5 |
| moderation | [F058 a member reports something, and the operator can take a phot](moderation/F058-report-and-remove-a-photo.md) | 6 | 4 | 0 |
| moderation | [F078 flagged content hides itself, and the poster is told why](moderation/F078-flagged-content-hides-itself.md) | 11 | 8 | 3 |
| moderation | [F080 no sensitive content in photos; the uploader confirms, a rep](moderation/F080-no-sensitive-photos.md) | 5 | 3 | 1 |
| moderation | [F100 an AI reads every reported item first, and a person makes th](moderation/F100-ai-first-pass-review.md) | 12 | 8 | 6 |
| moderation | [F101 one scannable page of flagged and reviewed Posts, decided in](moderation/F101-one-page-of-flagged-posts.md) | 15 | 12 | 2 |
| moderation | [F102 the poster answers first, report misuse is tracked, and the ](moderation/F102-poster-answers-first.md) | 14 | 9 | 3 |
| page-editing | [F056 a producer edits a shop that already exists](page-editing/F056-owner-edits-shop.md) | 9 | 5 | 0 |
| page-editing | [F069 a non-business Page resolves everywhere, and holding several](page-editing/F069-non-business-pages-resolve-everywhere.md) | 4 | 2 | 0 |
| sign-in-you | [F057 someone who isn't selling yet finds the way in](sign-in-you/F057-you-shows-the-way-in.md) | 5 | 2 | 0 |
| sign-in-you | [F065 someone follows a person, Page or venue, and nothing else ch](sign-in-you/F065-someone-follows-something.md) | 5 | 3 | 0 |
| sign-in-you | [F077 members see a display name; the legal name stays with the pl](sign-in-you/F077-display-name-public-legal-name-private.md) | 8 | 1 | 0 |
| sign-in-you | [F081 everyone signs up the same way, and the zip sets the metro](sign-in-you/F081-one-signup-zip-sets-metro.md) | 9 | 5 | 1 |

27 features reported (2 pre-existing: F081, F082). Not started (draft, deferred or superseded, not reported): drafts F048, F049, F067, F068, F071, F075, F079, F083–F090, F094–F098; deferred F055; superseded F073 (its Issue #173 is still open).

## Gaps by type (criteria, approximate: lists taken from each agent's routing table)

| Gap | Criteria |
|---|---|
| NOT-BUILT | ~64 (F074 all 8, F063 all 4, F064 3, F092 5 are wholly unbuilt) |
| NO-CHECK | ~99 |
| INVARIANT-UNPROVEN | ~39 |
| SPEC-CONFLICT (not filed, needs `scope-scenario`) | ~21 |
| NOT-SMOKED / NOT-LOOKED | every criterion |

Spec conflicts, by feature: F044 (1, 4, 5), F045 (1, 3–7), F046 (7), F056 (1, 3), F058 (2), F060 (2, 5 route name), F070 (5), F072 (1), F078 (3), F099 (11), F101 (2), F102 (7).

## Issues filed this run (#575 to #652, 78 in all)

| Kind | Count |
|---|---|
| `launch-blocking` (gates: launch, well-worn, agents can finish alone), milestone Beta 11-06 | 25 |
| `needs-pm` (11 have a question below; 6 are on launch features and carry the milestone) | 11 |
| Other (gates: none: check, guard and scenario Issues) | 42 |

Duplicates avoided: F063 (#34), F064 (#33), F069 (#22, #24), F070/F093 (#335), F072 (#314), F091 (#602), F045 (#54, #624) were already open and not refiled. Older launch Issues from the F081/F082 reports (#568, #569, #573, #570) are counted in neither total.

## PM queue (every `needs-pm` Issue, one question each)

| Issue | Feature | The one question |
|---|---|---|
| #648 | F102 c14 | Register SocialUs with NCMEC's CyberTipline before beta (needs a contact, maybe an entity), or use the manual web form as the beta fallback? |
| #641 | F100 c12 | Set up Cloudflare's CSAM Scanning Tool now (A), or beta with severity-1 rows going to a person without a hash result, check added before production (B, recommended)? |
| #640 | F100 c11 | Refuse the live flip in software until a passing harness run and your two-week shadow read are recorded (A), or keep it your checklist (B, recommend B for beta, A before production)? |
| #616 | F076 c15 | Which provider sends "your metro opened" (recommend Resend on a socialus.org subdomain), who sets up and pays for it, and do you approve the message wording? |
| #626 | F078 c2 | Is it enough for launch that the hide bar stays at 0 and score-driven hiding is built before you first raise a bar? (A yes, recommended; B no) |
| #627 | F078 c11 | Will you word, or approve as drafted, the report-path strings (report sheet, reason labels, misuse warning, 911 line, poster notice)? |
| #605 | F065 c5 | One follows table for people, Pages and venues: A add one and migrate (recommended), B keep three tables and amend the criterion to "one reader", or C defer past beta? |
| #588 | F059 c6 | Visitor with no metro: A Sacramento default plus a "Choose your area" pill (today), B choose-your-metro screen first, or C Sacramento only if their location resolves there, else B (recommended)? |
| #592 | F074 c1 | Approve the weekly-repeat composer wording: "Repeats weekly on", weekday chips, "Starts", "Ends (optional)"? |
| #619, #621 | F092 c2, c4 | Approve the words the filter panel writes into the box (lowercase plain words matching the sheet's labels, tags as #tag)? |
| #570 | F081 c9 | (existing, from the F081 report) VoIP refusal needs a Twilio Lookup account and spend: go ahead? |
| #33 (not labelled) | F064 | Rule on the two drafts it waits on (label layer, F088 "Other"); until then nothing can feed the signal table. |
| #16 (not labelled) | F056 c1, c3 | The scenario wants a "what we stand for" line, but the 2026-10-06 ruling cuts values from beta: build, defer, or amend the scenario? |

## Could not determine

Smoke result per merge commit (no run ties to a commit); deploy-health for several older merge commits and direct commits (F044–F046); whether `TWILIO_*`, `OPERATOR_PHONE` and `ANTHROPIC_API_KEY` are set in production (F078, F080, F100); whether `Reviewed by:` was ever recorded for PRs #174, #379 and #380; `area:` labels are absent on most feature Issues, so each report's area is the closest of the existing labels.
