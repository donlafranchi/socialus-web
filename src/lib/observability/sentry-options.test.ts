import { describe, it, expect } from 'vitest'
import { sentryOptions } from './sentry-options'

describe('Sentry reports only from production, traces sampled (2026-11-16 load re-run)', () => {
  it('is on for a Vercel production build', () => {
    expect(sentryOptions('production').enabled).toBe(true)
  })

  it('is off for CI, local and preview builds, so load runs and tests never reach the production project', () => {
    for (const env of [undefined, '', 'preview', 'development']) expect(sentryOptions(env).enabled).toBe(false)
  })

  it('samples one trace in ten: 100% cost a signed-in page 6x its p95 at 50 viewers', () => {
    expect(sentryOptions('production').tracesSampleRate).toBe(0.1)
  })
})
