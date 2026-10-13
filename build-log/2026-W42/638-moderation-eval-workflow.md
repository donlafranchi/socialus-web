# F100.9 · #638: the harness runs on every prompt change

`.github/workflows/moderation-eval.yml`, filtered (`paths:`) to `rules.ts`, `assess.ts`, `eval-metrics.ts`, `evals/moderation/**` and the script, on pull requests and on main. It always runs `npm run moderation:eval -- --check` (no key, no cost). The full run needs the repo secret **`ANTHROPIC_MODERATION_KEY`** (the issue said `ANTHROPIC_API_KEY`; the moderation key has its own name now) and writes its numbers to the run summary; with the secret absent it says so in the summary and passes. Recording a run for the readiness panel (`-- --record`) stays on Don's machine.

Needs from Don: add `ANTHROPIC_MODERATION_KEY` as a GitHub Actions repository secret (a key with a hard monthly spend limit) when he wants the full run in CI. Each full run costs the harness's per-case price (a few cents).
