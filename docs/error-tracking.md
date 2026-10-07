# Error tracking (#490)

Errors only, scrubbed, off until a DSN is set. Closes the accepted risk "no error tracking in production" (due 2026-10-16).

## What it is
`@sentry/nextjs` (free Developer plan: 5k errors a month, one user, email alerts). No traces, no session replay, no personal data by default, 20 breadcrumbs, known-noise errors dropped. Every event passes `src/lib/observability/scrub.ts` first: the user, cookies, auth headers, request bodies, query strings and free-form extras are removed, and emails and phone numbers are cut out of every string. The route, exception type, stack and device kind stay.

## Spend
A free plan stops at its quota; there is no overage unless pay-as-you-go is switched on in Sentry. **Leave it off.** No new paid tool is added by this.

## Turning it on (a person, once)
1. Create a Sentry account and a Next.js project (free Developer plan).
2. In Vercel (Production only), set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to the project's DSN. Redeploy.
3. In Sentry, add an alert rule: email on a new issue, and on more than 10 events in an hour.
4. Throw one test error on a preview; check the event arrives with no user, cookie or body.

Until step 2, nothing is initialised and nothing leaves the platform.

## Privacy
Sentry becomes a service that processes data for SocialUs (stack traces, page paths, device kind). Counsel's Privacy text must list it (see `counsel` in `src/lib/text-pages.ts`).

## Not done here
Source-map upload (stacks are minified until a Sentry auth token is added to the build), release tagging, and a heartbeat (a quiet Sentry cannot tell "no errors" from "not running"; the daily deploy-health check still runs).
