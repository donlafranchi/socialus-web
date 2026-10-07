// #490 — error tracking, browser side. Off until NEXT_PUBLIC_SENTRY_DSN is set;
// errors only; every event scrubbed. See docs/error-tracking.md.

import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/observability/options'

const options = sentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
})
if (options) Sentry.init(options)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
