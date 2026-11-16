# Error tracking

**As of 2026-11-16** · Source: hand-written · Maintained by: hand

Sentry (`@sentry/nextjs`) is always on, using the project's DSN in `sentry.server.config.ts`, `sentry.edge.config.ts` and `src/instrumentation-client.ts`. It replaced the env-gated, scrubbed errors-only setup from #490 (Don, 2026-11-16: the new Sentry account is meant to do more).

## What it sends
Errors and traces (100% sampling for now). User info and request bodies are off; headers, cookies and query params deny IP and user-identifying names. The old `scrub.ts` email/phone scrubber no longer runs on Sentry events.

## Open
- Privacy text lists Sentry (draft; counsel to confirm).
- Source-map upload, release tagging, alerts and a sampling rate below 100% are not set up.
