# F082: the rules a member agrees to before publishing a Page

category: create-posts · as-of: 2026-10-10 · scenario approved 2026-09-14 (amended to 2026-10-06) · tickets: #223 (closed, covered all 9 criteria), follow-up #573 · PRs: #493 (main), #326, #251
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard, absence of code proves nothing).

## Roll-up

| | built | checked (marked) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 9 criteria | 7 | 5 (2, 4, 5, 6, 7) | 9 | 9 | 0 | 0 |

Not built: **7 on a phone** (#573). Unknown: **3**. Built means the code is on main [V build log + files]; reviewed means PR #493 carries `Reviewed by: separate reviewer subagent (not the author)` [V]; shipped means deploy-health success on 96b0ea65 [V].

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Becoming a creator = agreeing before each new Page; no role column | behavior + invariant | yes | `creator_rules_agreements` records (member, Page, version, time); no role or account-type column found in migrations [V grep] | no marker | unknown | no |
| 2 | Fixed statements, agreeing is the attestation; no upload, ID or check | invariant | yes | Four rules with reasons in `creator-rules.ts` | yes (`BeforeYouPublish.test`) | unknown | no |
| 3 | Nothing attested shows as a badge or label | invariant | unknown | Nothing found [A]; nothing asserts it | no | unknown | no |
| 4 | Gates publishing, not drafting; selling and hosting alike | behavior | yes | `group.activate` refuses without the current version; drafts never ask. The retired sell walkthrough would be refused if revived [V build log] | yes | unknown | no |
| 5 | No "are you a business", legal or tax wording | invariant | yes | Rule text read today has none [V] | yes | unknown | no |
| 6 | Versioned; each agreement recorded; only the PM and operators see it | behavior | yes | `RULES_VERSION`, RLS on, no client policy [V build log] | yes | unknown | no |
| 7 | Rules one click away, even if not publishing | behavior | **no** | `/rules` exists, linked from the Publish card and the desktop footer. **On a phone the footer is hidden, so no link outside the Publish card.** Ticket #573 | yes (tests the existing links) | unknown | no |
| 8 | Publishing needs name, location, description, agreement, one tag; photo optional | behavior | yes | `group.activate` requires display name, anchor location, description and a tag [V]; photo-optional default image not checked [A] | no marker | unknown | no |
| 9 | One rule is "no pictures of children", verbatim | behavior | yes | Rule 4 matches the scenario text [V] | no marker | unknown | no |

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| NOT-BUILT | 7 (phone) | `build-ticket` on #573 | code + check |
| NO-CHECK (built, nothing asserts it) | 1, 8, 9 | `write-tickets` (one check ticket) then `build-ticket` (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | 3 (and 1's "no role column") | `write-tickets` (guard ticket listing the surfaces / schema to scan) then `build-ticket` | a standing guard |
| NOT-SMOKED | all | CI: tie smoke to the merge commit, then cover `/rules` and Publish | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

## Next, in order
1. #573 (criterion 7 on a phone). 2. One check ticket for 1, 8, 9 and one guard ticket for 3. 3. Fix smoke-vs-commit. 4. UAT Issue for criteria 2, 4, 5, 6, 9.
