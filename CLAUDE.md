# socialus-web — code repo

SocialUs: local discovery, buy/sell/trade/gather. Launching 2026-10-30 to one metro. Next.js App Router + TypeScript + Tailwind v4 + Supabase (Postgres/Auth/Realtime) + Mapbox GL JS, deployed on Vercel. Planning lives in the sibling repo `ops-pattern`; this repo is code.

## Naming

- **Issue title:** `F060 · T142 · plain name` for scenario work. `bug · plain name` / `change · plain name` / `chore · plain name` otherwise, with `Scenario: F###|none` in the body.
- **Branch:** `f060-t142-slug`. **Commit:** `F060/T142: what`. Bugs: `bug #nn: what`.
- **Provenance is git.** `git log --grep F060` is everything built for that scenario. No registers here.

## Before opening a ticket

Classify it by `ops-pattern/PIPELINE.md`'s five kinds first: scenario, change, bug, process, chore. Only a scenario carries acceptance checks. If a change or bug starts needing acceptance checks, it's actually a scenario — stop and ask `ops-pattern` for one before ticketing it as anything else.

## When a PR diverges from its scenario

A PR whose behavior differs from the cited scenario's Acceptance stops and asks for a scenario change first — in `ops-pattern`, not here. Don't quietly ship a different behavior than what was approved.

## Commits

Branch per ticket. Ask before merge to main — a merge to main deploys to production via Vercel. Never rewrite history. Never cross-commit with `ops-pattern`.

## Issue hygiene

`.github/ISSUE_TEMPLATE/work.md` and `.github/workflows/issue-lint.yml` enforce `Kind:`/`Scenario:` fields and flag scope drift automatically — label `needs-fix` means one of those checks failed; read the bot comment.
