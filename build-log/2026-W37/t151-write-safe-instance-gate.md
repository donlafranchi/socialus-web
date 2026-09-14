### T151 (#32) — Write-safe instance gate

The write-bound suites gated on `isLocal(SUPABASE_URL)`. The intent was right — they create real auth users and write real objects — but the question was wrong: **a Supabase branch has a remote hostname and would have skipped exactly as the sandbox did**, so the branch route could not work until this changed.

The question is now *"is this instance safe to write to"*, answered explicitly and never inferred: `SUPABASE_TEST_EPHEMERAL=1` **and** a host that is local or Supabase-hosted **and** both keys. Each half missing produces its own message — "carries no ephemeral marker" reads differently from "is not a local or Supabase-hosted instance", which reads differently again from the production refusal.

**One deviation, and it is a strengthening.** The ticket asks the guard to refuse "the known production project ref", implying a constant. There is none in this repo, and a constant nobody sets protects nothing. Instead the refusal derives from `NEXT_PUBLIC_SUPABASE_URL` — what this checkout's app actually talks to, so a remote value there **is** production by definition, needs no new variable, and cannot be forgotten. `SUPABASE_PROTECTED_REFS` adds any others. It is checked before every other condition and no marker overrides it.

Verified: `local Postgres` — all four combinations run end-to-end against the real suite, not just against the predicate. Local + marker runs green (5/5). Local without the marker, a marker on a non-ephemeral host, and a production ref with the marker set each go red with the right message. 11 new unit tests cover the same matrix.

**With the environment present the run now has zero skipped tests** — previously two suites skipped silently. Remaining reds are the known subprocess flake (#38) and the known signup red.

`.env.local.example` carries the recipe, both cautions, and the note that `.env*` already gitignores the file the keys go in.
