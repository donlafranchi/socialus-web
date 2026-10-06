// Bug #405 — a browser carrying a stale session could not finish an emailed
// sign-in link, and members were signed out over and over.
//
// Both run the real @supabase/ssr and auth-js against a stubbed network,
// because the failure lives inside them: a refresh that answers
// refresh_token_not_found makes auth-js sign the browser out, and signing out
// deletes the PKCE code-verifier cookie along with the session.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (!value || options?.maxAge === 0) jar.delete(name)
      else jar.set(name, value)
    },
  }),
}))

const URL_ = 'https://ref405.supabase.co'
const SESSION = 'sb-ref405-auth-token'
const VERIFIER = `${SESSION}-code-verifier`
const user = { id: '00000000-0000-4000-8000-000000000405', aud: 'authenticated', email: 'a@example.test' }

function encode(v: unknown) {
  return 'base64-' + Buffer.from(JSON.stringify(v)).toString('base64url')
}
const staleSession = encode({
  access_token: 'stale-access',
  refresh_token: 'revoked-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 3600,
  user,
})
const freshSession = {
  access_token: 'fresh-access',
  refresh_token: 'fresh-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
}

const calls: string[] = []
function network(refresh: 'revoked' | 'ok') {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.includes('grant_type=refresh_token')) {
      return refresh === 'ok'
        ? json(200, freshSession)
        : json(400, { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' })
    }
    if (url.includes('grant_type=pkce')) return json(200, freshSession)
    if (url.endsWith('/user')) return json(200, user)
    return json(200, {})
  }))
}

beforeEach(() => {
  jar.clear()
  calls.length = 0
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  vi.resetModules()
})

describe('bug #405 — the emailed link, from a browser with a stale session', () => {
  it('exchanges the code instead of losing the verifier to the stale session', async () => {
    jar.set(SESSION, staleSession)
    jar.set(VERIFIER, JSON.stringify('verifier-405'))
    network('revoked')

    const { GET } = await import('./route')
    const res = await GET(new Request('https://www.socialus.test/auth/callback?code=abc&next=%2Fyou'))

    expect(calls.some((u) => u.includes('grant_type=pkce')), 'the code must reach /token').toBe(true)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/you')
  })
})

describe('bug #405 — the proxy', () => {
  function req(cookies: Record<string, string>) {
    const r = new NextRequest('https://www.socialus.test/explore')
    for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v)
    return r
  }

  it('never deletes the code verifier a pending sign-in needs', async () => {
    network('revoked')
    const { proxy } = await import('@/proxy')
    const res = await proxy(req({ [SESSION]: staleSession, [VERIFIER]: JSON.stringify('verifier-405') }))
    const cleared = res.cookies.getAll().filter((c) => c.name === VERIFIER && !c.value)
    expect(cleared, 'a stale session must not take the verifier with it').toHaveLength(0)
  })

  it('hands a refreshed session to the page it is rendering, not only to the browser', async () => {
    network('ok')
    const { proxy } = await import('@/proxy')
    const res = await proxy(req({ [SESSION]: staleSession }))
    expect(res.headers.get('x-middleware-request-cookie') ?? '').toContain(SESSION)
    expect(res.headers.get('x-middleware-request-cookie') ?? '').not.toContain(staleSession)
  })

  it('sends a sign-in code that landed on another page on to the callback', async () => {
    network('ok')
    const { proxy } = await import('@/proxy')
    const res = await proxy(new NextRequest('https://www.socialus.test/?code=abc'))
    const to = new URL(res.headers.get('location') ?? 'https://x/')
    expect(to.pathname).toBe('/auth/callback')
    expect(to.searchParams.get('code')).toBe('abc')
    expect(to.searchParams.get('next')).toBe('/')
  })
})
