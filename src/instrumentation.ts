// #490 — error tracking, server side. Off until SENTRY_DSN is set; errors only;
// every event scrubbed (src/lib/observability). See docs/error-tracking.md.

import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/observability/options'

export async function register() {
  const options = sentryOptions()
  if (!options) return
  Sentry.init(options)
}

export const onRequestError = Sentry.captureRequestError
