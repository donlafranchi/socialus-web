### change #323 — the apply workflow is apply.yml, "Apply migrations"; branches are Issue numbers

Don, 2026-10-02: "keep it short".
- `.github/workflows/migrations-apply-production.yml` → **`.github/workflows/apply.yml`**, named **"Apply migrations"**.
- **Don's command:** `gh workflow run apply.yml --ref <branch> -f confirm=apply`. It's given everywhere that says how to apply:
  - CI's "apply it first" error, which names the PR's branch;
  - the deploy health check and `/api/health/schema` (from main);
  - the drift and pending scripts;
  - the PR template's **Migration** section.
- **The confirmation stays:** `-f confirm=apply` is part of every instruction, and a run without it is refused. The guard still refuses a stacked branch, or more than one pending migration without `allow_multiple`.
- **Branches** are named by their Issue number only (`CLAUDE.md` § Naming), e.g. `318`. Open branches keep their names.
- **In-flight migration branches** need main merged in before they can be applied this way, because a run uses the workflow file on its own branch.

Tests: the name and the CI message's command, seen failing first; guard and health tests updated. No migration.
