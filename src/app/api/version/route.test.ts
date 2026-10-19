import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from './route'

afterEach(() => vi.unstubAllEnvs())

// #958 — an open tab asks which build is live; the answer is never cached.
describe('GET /api/version', () => {
  it('answers the live build id, uncached', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123')
    const res = await GET()
    expect(await res.json()).toEqual({ id: 'abc123' })
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('answers an empty id where there is no build to compare (a dev server)', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
    expect(await (await GET()).json()).toEqual({ id: '' })
  })
})
