### chore #264 — the production apply refuses to run ahead of its code

On 2026-09-30 three stacked migration PRs (#254, #255, #258) were applied before any of their code merged, and signed-out Pages 404'd until it did. Don approved a guard on 2026-10-01.

- **`scripts/migrations-apply-guard.sh`** refuses before anything is applied in three cases:
  - a branch whose open PR targets anything but main (stacked), exit 4
  - a non-main branch with no open PR, exit 4
  - more than one pending migration unless `allow_multiple` is checked, exit 5

  It looks the PR up with `gh`, and fails closed (exit 2) if it can't.
- **Workflow:**
  - `allow_multiple` boolean input, off by default
  - `permissions: contents: read, pull-requests: read`
  - `migrations-pending.sh` hands its pending list over via `PENDING_OUT`
- **[guard-proves-itself]:** every run first runs the guard against a stacked fixture and stops if it passes. Fixtures in `tests/migrations-apply-guard.test.ts` cover stacked, main-based, main, no-PR, two pending, override, and override-does-not-unstack. All were seen failing before the script existed.
- Live check against real PRs: #263 (stacked on #261) refused with exit 4; #261 (based on main) passed.
- Trigger stays `workflow_dispatch` only, now asserted by a test.
