# F046: scrolling hides the bottom nav

category: explore-map (no Issue carries an `area:` label; nearest of the list, the nav is global) · as-of: 2026-10-10 · scenario shipped (approved; file deleted at sync, criteria recovered from a copy) · tickets: #3 (T112, closed), #4 (T113, closed), check #651 · PRs: none (T112, T113 landed as direct commits 238cef7, ac179c1 on main, 2026-09-02)
Regenerated whole each run. **[V]** read or run today, **[A]** assumed. Kinds: **behavior** (something works), **invariant** ("never / no / nothing": needs a standing guard), **coverage**, **external**. Gates: none. Open Issue #220 is F078's hide bar (reports), unrelated.

## Roll-up

| | built | checked (marked) | reviewed | shipped | smoked | PM looked |
|---|---|---|---|---|---|---|
| 7 criteria | 6 | 0 (6 unmarked) | unknown | unknown | 0 | 0 |

Not built as written: **7** (visual spec; the bar was later rebuilt to a newer design, see below). Built means the code is on main [V grep + files]. Reviewed: no PR, so no `Reviewed by:` line; the build log cites an M2 code review and M3 accessibility pass [V build log]. Shipped: no check-runs or status on ac179c1 / 63115c2 [V `gh api`]. Smoked: `smoke-live` runs on a schedule and by dispatch, not per commit, and the latest runs failed today [V]; none belongs to an F046 commit.

## Per criterion

| # | In plain words | Kind | Built | What exists / what is missing | Checked | Smoked | PM looked |
|---|---|---|---|---|---|---|---|
| 1 | Scroll down more than 20px: nav slides out, ~200ms ease-out | behavior | yes | `useScrollDirection` (20px threshold, rAF-throttled) feeds `NavVisibilityProvider`, mounted in `layout.tsx`; `BottomNav` uses `translate-y-full`, `duration-200 ease-out` [V]. Live-verified at 375x812 in build log. | unmarked: `useScrollDirection.test.ts`, `BottomNav.test.tsx` | unknown | no |
| 2 | Scroll up more than 20px: nav returns | behavior | yes | Same hook, `travel < -threshold` sets visible [V] | unmarked: `useScrollDirection.test.ts` | unknown | no |
| 3 | At scrollTop <= 0 the nav is visible | behavior | yes | `if (y <= 0) setVisible(true)` [V] | unmarked: `useScrollDirection.test.ts` | unknown | no |
| 4 | Nav visible on first render of any tab | behavior | yes | `useState(true)`, context default `true`, route change resets to visible [V] | unmarked: `useScrollDirection.test.ts`, `BottomNav.test.tsx` | unknown | no |
| 5 | No layout shift or scroll jump when it shows or hides | behavior | yes | Bar is `fixed bottom-0`, out of flow; pages pad with `--nav-height` constant, not by visibility [V]. Build log: no content jump. | unmarked: `BottomNav.test.tsx` "out of the document flow"; nothing measures layout shift | unknown | no |
| 6 | Same behavior on Home, Explore, You | coverage | yes | One global provider in `layout.tsx`, so it applies wherever the nav shows [V]. Home is paused, so the tabs are Explore and You; Create is a link in the same bar [V]. Nav is intentionally absent on auth, onboarding, admin and full-height Edit Page (#296, #358) [V]. | unmarked: `NavVisibilityProvider.test.tsx` (route reset); nothing asserts every nav route is under the provider | unknown | no |
| 7 | Visual spec: 44px, 9px/500 labels 3px below icon, 20px/1.5 icons filled when active, charcoal active, #717171 inactive, 1px #EBEBEB border, opaque white | behavior | **no** | Met: 20px 1.5-stroke icons, filled when active, charcoal `#3C3C3C` active, `#717171` inactive, `#EBEBEB` top border, opaque white, safe-area padding [V]. **Not met as written: bar is 56px (`--nav-bottom-h`, #294/#296 "the design's 56px"), labels are the 12px `micro` token, gap is 2px, and a Create action sits between the tabs (T158).** Tests now assert the newer values (`BottomNav.test.tsx` "bar is 56px tall") [V]. | tests assert the newer design, not this text | unknown | no |

Edge cases (not numbered; [V] code): overlay pause (`useOverlayOpen`, `aria-modal` / `data-nav-pause`), keyboard hides nav (`useKeyboardOpen`), flicker guard (direction flip zeroes accumulator), reduced motion (`motion-reduce:transition-none`), desktop (`md:hidden`, top nav). All have unit tests, unmarked. **Resolved item:** kind-filter pills staying fixed when the nav hides: nothing but `BottomNav` reads `useNavVisible` today and `KindFilterPills` no longer exists in `src` [V grep]; the ruling no longer applies to any code.

## Routing: what each gap goes to next

| Gap | Criteria | Next skill | Output |
|---|---|---|---|
| SPEC-CONFLICT | 7 (scenario says 44px / 9px labels / 3 tabs; main follows the 2026-10-01 design: 56px, 12px, Create) | `scope-scenario` (amend criterion 7 to the shipped design, or PM rules) | amended criterion |
| NOT-BUILT | none other | none | none |
| NO-CHECK (built, nothing asserts it) | 1, 2, 3, 4, 5, 6 (tests exist, unmarked) | `build-ticket` on #651 (tests only, seen failing) | marked tests |
| INVARIANT-UNPROVEN | none | none | none |
| NOT-REVIEWED | 1-7 (direct commits, no PR review line) | `review-pr-bundle` if wanted | review section |
| NOT-SMOKED | all | CI: tie smoke to the merge commit; cover scroll-to-hide on a phone viewport | smoke result |
| NOT-LOOKED | all | `record-pm-review` (UAT Issue) once the above are done | closed UAT Issue |

Filed: **#651** (check criteria 1-6). Criterion 7 spec conflict is not filed (`scope-scenario` handles it). No milestone: `gates` absent, unplanned.

## Next, in order
1. `scope-scenario`: amend criterion 7 to the 56px design. 2. `build-ticket` on #651. 3. Fix smoke-vs-commit. 4. UAT Issue for criteria 1-6.
