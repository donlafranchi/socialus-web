import { describe, it, expect, vi, beforeEach } from 'vitest'

const { captureRequestError } = vi.hoisted(() => ({ captureRequestError: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureRequestError, init: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

describe('instrumentation', () => {
  it('loads the server config on the node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { register } = await import('./instrumentation')
    await expect(register()).resolves.toBeUndefined()
  })

  it('hands request errors to Sentry', async () => {
    const { onRequestError } = await import('./instrumentation')
    expect(onRequestError).toBe(captureRequestError)
  })
})
