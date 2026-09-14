### T155 (#52) — The feed's vantage point becomes a metro

**Model-independence verified before lifting, not trusted.** `metro_polygons` (migration 031) references no Item table and no `discoverable_items` — it is a geography overlay plus `members.home_metro_id`, and `resolve_home_metro` takes a point and returns a uuid. The precedence rule is a statement about what a person meant, not about what they are looking at. **Neither is touched by the no-Items change.** A test asserts the resolver reads `metro_polygons` and nothing else, so a later edit reaching for an Item-shaped table fails the run rather than passing review.

`resolveFeedMetro`, `listFeedMetros`, `DEFAULT_METRO_SLUG`. Precedence **requestedSlug → memberMetroId → default**, every step falling through rather than failing, so an unknown slug or a stale member metro lands on something rather than a blank feed.

**Only half of this ticket was buildable, and the split is the finding.** The other half — a metro-grain SQL function "returning the same column set as the Page-grain source" — **depends on #51, which is not built.** There is no column set to mirror. Building it against `discoverable_items` would wire the metro path to Item grain, which is the thing the reissue exists to remove. **#52 stays open for that half.**

**The precedence inversion is deliberate, and now has a test whose only job is to stop it being tidied away.** `resolveFeedPlace` returns on `memberPlaceId` before it reads `requestedSlug` — which is why the shipped scope picker does nothing for a signed-in Member with a home set. The metro resolver inverts it. A test asserts the two differ, so a later refactor toward "consistency" fails rather than silently restoring the bug.

**A DB-backed suite covers what stubs cannot.** The unit tests stub the client, so they prove the precedence logic and nothing about whether `metro_polygons` has the columns this reads or the row `DEFAULT_METRO_SLUG` names — the gap through which a resolver ships green and returns null in production. Three read-only SELECTs close it: the columns exist, the default row exists, and slug is unique so a lookup may use `maybeSingle`. Gated with T150's fail-loudly helper; **not** T151's write-safe gate, since it writes nothing.

**The rural hole is unchanged and not this ticket's to close.** `members.home_metro_id` is null outside every seeded CSA, and there is exactly one seeded metro. The default keeps the surface non-blank; it does not make the feed relevant to someone in another state.

Verified: `local Postgres` — the DB suite runs green against `supabase start`, and the seeded row was confirmed directly (`sacramento-roseville-ca`). Tests: 15 new. Full suite: **133 files, 1568 tests, all passing, nothing skipped.** tsc/eslint at baseline.
