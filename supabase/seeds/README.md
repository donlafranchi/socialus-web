# The seeds are privileged, and that has hidden real bugs

Everything in this directory writes to the database **as `postgres`**, not as a
member. That is a deliberate choice with a cost, and the cost has already been
paid twice. Read this before you trust a surface because it looks right on
seeded data.

## What "privileged" means here, concretely

`the-good-place.sql` — the public showcase seed, and the data behind most of
what you see on a local stack:

- **runs as the table owner**, so every row-level security policy is bypassed;
- **disables two triggers** for the length of its transaction,
  `public.members.members_assert_id_in_auth_users` (so showcase Members exist
  with no `auth.users` row, cost no MAU, and cannot be logged into) and
  `public.item_events.trg_refresh_discoverable_items` (because it refreshes a
  materialized view concurrently, which cannot run inside a transaction);
- **hard-codes every UUID**, with reserved prefixes per entity, so re-running
  upserts instead of duplicating;
- **writes rows directly**, never through the action layer that ADR-7 requires
  of the app.

`seed-markets.sql` and `scripts/seed-folsom-coffee.sql` are older still: they
target `markets` / `businesses`, from before Pages.

## Why that is a hazard and not just a shortcut

A seeded row is assembled by whoever wrote the SQL. A real row is assembled by
a handler, from a form, by a person. **When the two disagree, the seed is the
one that looks correct**, because it was written by someone who already knew
what the finished row should contain.

So a surface can be complete and correct against every seeded row, and broken
for every row a member actually creates, and nothing goes red — the tests pass,
the page renders, the demo works.

That is not hypothetical:

- **bug #175 — "A Page a member created has no reachable URL."** Seeded Pages
  had what member-created Pages lacked. Browsing the seed data showed working
  Page URLs the entire time. It took someone making a Page by hand to find it,
  weeks in.

## What to do about it

**Do not add more privileged seeds.** If you need data to look at, prefer
creating it the way a member would — through the action layer, with a real
`auth.users` row. It costs an MAU and it is slower to write, and in exchange
the data you are looking at is the data your users will have.

**When you verify a change, verify it against a row that went through the
handler**, not against `the-good-place`. "It works on the seed" is evidence
about the seed.

**If you must seed with privilege, say so in the file** — which trigger, which
policy, which invariant is standing down, and why. The existing seeds do this
well; that header is the reason this file could be written at all.

## Why these seeds are still here

They are not a mistake to clean up. The showcase seed populates every b1
primitive end-to-end so the platform can be demonstrated and built against
without waiting for real members, and it is carefully built — idempotent, fully
identified by `{"demo_seed": "the-good-place"}`, disjoint from the real place
hierarchy, with a teardown block at the bottom of the file.

The hazard is not that it exists. It is that its rows are more complete than
real ones, and that difference is invisible until someone looks for it.
