// #490 — the server side of error tracking: initialised only when configured,
// and unhandled request errors are captured.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { init, captureRequestError } = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ init, captureRequestError }))

beforeEach(() => {
  vi.resetModules()
  init.mockClear()
  captureRequestError.mockClear()
  vi.unstubAllEnvs()
})

describe('register', () => {
  it('does nothing without a DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { register } = await import('./instrumentation')
    await register()
    expect(init).not.toHaveBeenCalled()
  })

  it('starts the server SDK with the scrubbing options when a DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { register } = await import('./instrumentation')
    await register()
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0]![0]).toMatchObject({ tracesSampleRate: 0, sendDefaultPii: false })
  })
})

describe('onRequestError', () => {
  it('hands request errors to Sentry', async () => {
    const { onRequestError } = await import('./instrumentation')
    expect(onRequestError).toBe(captureRequestError)
  })
})
