### T140 — Migration drift check, detection half (parent-repo ticket)

Substrate. `scripts/migration-conformance.sh` (parent repo) shells `supabase migration list`, parses the Local/Remote table, and reports (never applies) any local migration absent from the remote. Wired into the `orient` drift checklist and `close`'s session-end step, alongside `npm run db:push` in `web/package.json`.

**Verified against the real linked remote** (`supabase link --project-ref khghdkdsicoeafyuvewl`, read-only): every migration through **038 is already applied**, contrary to this same week's T137 note above saying 038 was still outstanding. Something pushed it between T137's merge and this ticket — see `development/DEVIATIONS.md` (T140) in the parent repo. `-o json` does not work on this CLI version for `migration list`; the script parses the plain-text table instead, degrading to a warning rather than a false "clean" if that format ever changes.
