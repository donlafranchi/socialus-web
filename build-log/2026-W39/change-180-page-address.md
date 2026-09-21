### change #180 — The owner can move their Page, and a Location knows its Place

**Two gaps, and one of them was a mislabel.**

The edit form showed a block headed **Address** containing the Page's **URL**, frozen, with a reason about breaking links people already had. Both halves of that were true about the link and neither was true about the address — so an owner reading it was told they could not move house. The link is still frozen and still says why; **Address** now means where the Page is, and it is editable.

The picker is `<LocationPlaceFields>`, the same control creation uses — the rule T142 set for it, so the two cannot come to disagree about what an address is. `group.update` already accepted `anchorLocationId`; nothing but the form was missing.

**A Location is made first and the Page is pointed at it second, and if the first half fails the second never runs.** Half a move leaves a Page pointing at nothing, which is a Page with no address at all — the state #175 was reported from.

**`locations.place_id` is populated, at last.** T075 added the column saying population would "land in a later ticket"; it never did, so every Location a member ever made carried a null and everything joining through it got nothing back. It is written in the same statement as the row, derived from the point being written — not from a second parameter, which would be a second chance to disagree with the column, and not in a second round trip. **Which Place: the deepest containing one, smallest area on a tie** — `place_for_coords` already answers exactly that, so it is called rather than re-decided. A point no polygon covers yields null: the Location loses its breadcrumb and keeps its existence. Verified against local Postgres — a Sacramento point now resolves to `ca/sacramento`, where it resolved to nothing before.

**The Location actions left `/you/sell/`.** They are not about selling and never were; they are how anything on SocialUs says where it is, and the Page edit form needs them as much as the walkthrough does. `/you/sell` is retired as a surface (#177), so an owner changing their address would have been importing from it to do so.

**One real trap found on the way.** The first move left compatibility re-exports behind in `src/app/you/sell/actions.ts`. A `'use server'` module may export nothing but async functions — **not a type, and not a re-export binding** — and Turbopack's answer to one is to give the module **no exports at all**. Every caller of every *other* action in that file then fails to resolve, with an error naming the caller and never the cause. `npm test` passes either way; only `next build` catches it. Callers import the new module directly.

**One dead end found and fixed.** `LocationPlaceFields` rendered `state.mode === 'address' ? (…) : null` — so "Rather give a neighbourhood?" replaced the whole control with an empty panel: no input, no list, no way back. The only path that ever set that mode and still showed something was picking a place out of the suggestions. Nothing tested it. Found while embedding the component in the edit form, where an owner changing their address would have walked straight into it.

Tests: 20 new (the `place_id` write and its one-statement, one-point derivation; the address section's open/cancel/save paths including the refusal to move a Page when the Location could not be made; the picker's neighbourhood mode). Full suite green against local Postgres. `tsc`, `eslint`, `check:action-layer` and `next build` all clean.

**No migration.** The column has existed since T075; this is the first thing that writes it.
