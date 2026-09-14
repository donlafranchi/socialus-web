### chore #71 — The drift gate runs, for the first time

`supabase link` is gone from the drift and pending jobs. It called `GET /v1/projects/{ref}/api-keys?reveal=true` to resolve the project's **service-role secret**, which a scoped access token cannot reveal — supabase/supabase#50244, open, 403 even at Full access. Three token regenerations produced the identical error because no scope was ever going to fix it. **Migration history is a table in the database, not an API key**: `supabase migration list --db-url` reads it and never asks for an access token at all.

`scripts/supabase-db-url.sh` builds the connection string from `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` — already set, nothing new for Don.

**Both caveats were proven on a runner rather than assumed.** `db.<ref>.supabase.co` publishes AAAA and **no A record**; the job log prints its IPv4 lookup as empty every run, so the reason the pooler is used stays visible rather than becoming folklore. `aws-1-us-west-2` answered `(ENOTFOUND) tenant/user not found` and `aws-0-us-west-2` connected; aws-0 is now tried first with aws-1 kept as fallback. **The region was us-west-2, not the us-west-1 first guessed** — resolved from the project's AAAA against AWS's published IPv6 ranges after the first run failed.

**Failures now name the secret at fault.** Missing or whitespace-wrapped ref, a ref that is not 20 lowercase letters, a missing password, `password authentication failed` (→ "the DATABASE password, not your account password"), `ENOTFOUND` (→ "that host does not host this project — wrong region or shard"), and unreachable-on-every-host (→ region, or Network Restrictions). Each says where in the dashboard to go.

**What it found: production is clean.** 41 local migrations, 41 remote, matching one-for-one through `20260911161136`. No remote-only rows — nothing has been applied outside the files since the 2026-09-11 management-API divergence was reconciled. `003` is absent on both sides and has no file here, so it is a gap in the sequence, not drift. **This is the first real output this gate has ever produced.**

`SUPABASE_PROJECT_REF` was confirmed equal to the ref recorded above via a temporary boolean check in CI — compared, never printed — and the step was removed before merge.

**`migrations-apply-production.yml` is deliberately untouched** and still calls `supabase link`. It is manual, it is Don's button, and `db push` genuinely needs the link. It will hit this same wall the first time anyone uses it. Known, not a surprise — its own ticket.

Verified: `live DB` — read-only. The drift job is green on this branch (run 34795617054) against socialus-db.

**Deploy is not complete at merge.** No migration this ticket.
