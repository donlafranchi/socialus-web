# Error tracking

**As of 2026-11-26** · Source: hand-written · Maintained by: hand

Sentry (`@sentry/nextjs`) is always on, using the project's DSN in `sentry.server.config.ts`, `sentry.edge.config.ts` and `src/instrumentation-client.ts`. It replaced the env-gated, scrubbed errors-only setup from #490 (the PM, 2026-11-16: the new Sentry account is meant to do more).

## What it sends
Errors, and traces for one request in ten (#1347: 100% cost a signed-in page 6x its p95 at 50 viewers; 10% cost little). Production builds only. `sentryOptions()` sets `sendDefaultPii: false` and runs `scrub.ts` on every event before it leaves (#1455, restoring #490's rule): no user, extras, cookies, bodies or query strings; emails and phone numbers cut from every string; traces keep paths and timings with query strings stripped from transaction names and span URLs. `dataCollection` in each init is a second layer.

## Open
- Whether the Privacy text must mention Sentry is a counsel item flagged "review before launch" in `src/lib/text-pages.ts`; nothing is stated to members yet.
- Alerts are the PM's step (INFRASTRUCTURE.md §11).
