# Pin the runner, bump the actions

*2026-09-17. Two warnings on every run; one is cosmetic and one is a real change landing near launch.*

## The runner pin — the important half

`ubuntu-latest` **migrates to Ubuntu 26 from 2026-10-19**. Launch is
2026-10-30. That is eleven days.

An unpinned runner would change the OS, the preinstalled toolchain and the
default package versions underneath us in the worst week of the project, and the
first symptom would be a job failing for a reason unrelated to anything anyone
changed — during the week when every failure looks like it might be the launch
breaking.

**All nine jobs across five workflows now pin `ubuntu-24.04`.** That is exactly
what every run has been using (confirmed from a run log: `Image: ubuntu-24.04`),
so this freezes what is already proven rather than adopting anything new. It is
a deliberate freeze, and the comment says to revisit after launch.

## The action bumps — the cosmetic half

Node 20 is deprecated, so four actions were being force-run on Node 24 and
saying so on every run. Bumped to **the first major that declares `node24`** —
not to latest:

| Action | Was | Now | Latest | Why not latest |
|---|---|---|---|---|
| `actions/checkout` | v4 | **v5** | v7 | v6 changes credential persistence, v7 changes fork-PR checkout semantics for `pull_request_target` / `workflow_run`. We use neither trigger, but neither change buys us anything and both touch security behaviour. |
| `actions/setup-node` | v4 | **v5** | v7 | same reasoning |
| `actions/github-script` | v7 | **v8** | v9 | same reasoning |
| `supabase/setup-cli` | v1 | **v2** | v3 | **v3 switches the CLI install from GitHub releases to npm and drops the `github-token` input.** That is a real behaviour change on the one workflow that writes to production, for no benefit we need. |

**v2 of `setup-cli` is `using: composite`** — shell steps, no Node runtime at
all — so it cannot emit the warning that prompted this. v1 was `node20`.

Minimal change was the rule throughout: six weeks from launch, the version that
fixes the stated problem and nothing else.

## The production apply workflow, reasoned about rather than assumed

It writes to `socialus-db`, so its bump got checked step by step:

- **`checkout@v5`** — `fetch-depth: 0` preserved, which the wrong-ref guard
  depends on. Verified in the file, not assumed.
- **`setup-cli@v2`** — composite, installs the same CLI from the same GitHub
  releases as v1. The inputs we pass (`version: latest`) are unchanged, and we
  never passed `github-token`, so nothing v3 removes was in use.
- Its safety properties are now asserted by tests rather than left to review:
  still `workflow_dispatch` only with no push trigger and no schedule, still
  runs the preflight before `db push`, still full-history checkout.

**It can also be exercised without risk.** `main` currently has nothing pending,
so running the apply workflow against `main` exercises checkout, setup-cli, the
connection string, `migration list`, and the new preflight — and then stops at
the preflight, which correctly refuses. Every step except the write, with no
write possible. That is the safe smoke test if one is wanted.

## The guard

`tests/workflow-pins.test.ts` — 20 assertions. The pin is exactly the kind of
thing the *next* workflow forgets, and a new file with `ubuntu-latest` would
inherit the October migration silently. Now it fails a test instead.

It also asserts every action used is in the minimum-version table, so adding an
action nobody has thought about fails rather than passing quietly.

## Checks

20 new tests pass; the full suite and build are green in CI.
