### change — the apply workflow loses its emoji, and every instruction gives the command

Don, 2026-10-02.
- `.github/workflows/migrations-apply-production.yml` is now named **"Apply migrations to PRODUCTION"** (the file name is unchanged).
- Everywhere that tells Don how to apply now gives the terminal command: `gh workflow run migrations-apply-production.yml --ref <branch> -f confirm=apply`. That covers:
  - CI's "apply it first" error, which names the PR's own branch;
  - the deploy health check and `/api/health/schema` (from main);
  - the drift and pending scripts;
  - the PR template's new **Migration** section.
- `-f confirm=apply` is required: the workflow's `confirm` input refuses a run without it.

Tests: the name test and the CI message's command were seen failing first. The guard and health tests were updated to the command. No migration.
