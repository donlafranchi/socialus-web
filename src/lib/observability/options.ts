// #490 — error tracking, errors only, off until a DSN is set. The free tier is
// the budget: no traces, no session replay, few breadcrumbs, known-noise errors
// dropped, and no pay-as-you-go to enable (a free plan stops at its quota).
// Every event passes `scrubEvent` before it leaves.

import type { ErrorEvent } from '@sentry/nextjs'
import { scrubEvent } from './scrub'

type EnvLike = Record<string, string | undefined>

export interface SentryOptions {
  dsn: string
  environment: string
  tracesSampleRate: 0
  sendDefaultPii: false
  maxBreadcrumbs: number
  ignoreErrors: RegExp[]
  beforeSend: (event: ErrorEvent) => ErrorEvent | null
}

export function sentryOptions(env: EnvLike = process.env): SentryOptions | null {
  const dsn = (env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim()
  if (!dsn) return null
  return {
    dsn,
    environment: env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    ignoreErrors: [/ResizeObserver loop/, /AbortError/, /Load failed/, /NetworkError when attempting to fetch/],
    beforeSend: (event) => scrubEvent(event),
  }
}
