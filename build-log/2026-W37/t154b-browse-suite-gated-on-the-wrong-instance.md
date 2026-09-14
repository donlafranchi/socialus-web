### T154 follow-up (#60) — The browse suite was gated on an instance it never writes to

`tests/migrations-browse-pages.test.ts`'s behaviour half failed on every genuine run since 2026-09-12 with `cannot run: the browse source actually withholds drafts, unlisted and dissolved Pages`. **The suite's own guard, firing correctly about the wrong thing** — not a wrong assertion.

**The defect, and it was mine.** The suite writes to Postgres through `DATABASE_URL`, opening a `pg` Pool; it never touches the Supabase API. It gated on `writeSafety(process.env)`, which judges `SUPABASE_URL` and the Supabase keys. **Two variables, two different instances, and the one being judged was not the one being written to.** A developer following the documented `DATABASE_URL` recipe — which the read-only half of the same file asks for — got the read half running and the write half refusing with *"SUPABASE_URL is not set."*

**Fixed in the gate, not the test.** `databaseWriteSafety(databaseUrl, env)` judges a Postgres connection string under the same rules T151 set, and both entry points now share one `judge()` rather than duplicating them. **Every T151 guarantee is proven to survive**, against the real production ref: no marker still goes red, a non-ephemeral host still goes red, and the production database is still refused unconditionally with the marker set.

**One shape difference worth stating.** A Supabase project URL carries the ref as its first label (`<ref>.supabase.co`); a Postgres host carries it as an inner one (`db.<ref>.supabase.co`). Matching on the first label alone would have let the production database through, so the Postgres path matches on containment.

**Not the browse source.** `browse_pages` was correct throughout — its predicate already withheld drafts, unlisted and dissolved Pages, which is what the suite proves now that it runs.

Verified: `local Postgres` — 13/13 with only `DATABASE_URL` and the marker set, which is the case that was failing. 8 new gate tests, 19 in that file. Full suite green.
