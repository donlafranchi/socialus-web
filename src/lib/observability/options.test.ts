// #490 — error tracking is off until a DSN is set, errors only, and free-tier sized.

import { describe, it, expect } from 'vitest'
import { sentryOptions } from './options'

describe('sentryOptions', () => {
  it('is off without a DSN: nothing leaves, nothing is initialised', () => {
    expect(sentryOptions({})).toBeNull()
    expect(sentryOptions({ SENTRY_DSN: '  ' })).toBeNull()
  })

  const on = sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1', VERCEL_ENV: 'production' })!

  it('sends errors only: no traces, no session replay, no personal data by default', () => {
    expect(on.tracesSampleRate).toBe(0)
    expect(on.sendDefaultPii).toBe(false)
    expect(on).not.toHaveProperty('replaysSessionSampleRate')
  })

  it('every event passes the scrubber', () => {
    expect(typeof on.beforeSend).toBe('function')
  })

  it('names the environment, so previews and local runs never page anyone', () => {
    expect(on.environment).toBe('production')
    expect(sentryOptions({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' })!.environment).toBe('development')
  })

  it('the browser reads its own public DSN', () => {
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1' })).not.toBeNull()
  })

  it('keeps volume small enough for the free tier: few breadcrumbs, noisy errors ignored', () => {
    expect(on.maxBreadcrumbs).toBeLessThanOrEqual(20)
    expect(on.ignoreErrors).toEqual(expect.arrayContaining([/ResizeObserver loop/]))
  })
})
