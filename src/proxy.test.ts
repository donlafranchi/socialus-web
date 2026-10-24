import { describe, it, expect, vi, beforeEach } from 'vitest'

// A stale session cookie must not take the whole request down.
//
// Two occurrences in production tonight: `getUser()` threw "Invalid Refresh
// Token" from the middleware, which runs on every matched route — so one
// expired cookie in one browser turned into a 500 on every page that browser
// asked for, with no way out except clearing site data by hand. The member
// cannot do that and would not know to.
//
// Signed out is a state the app already handles everywhere. Failing to refresh
// a token means signed out; it does not mean the request is unserviceable.

// `getUser` holds the session each test sets up. #791 — the proxy reads it from the
// token's verified claims; `authServer` counts the round trips to the auth server.
const { getUser, authServer, legalNameRow } = vi.hoisted(() => {
  const getUser = vi.fn()
  return {
    getUser,
    authServer: vi.fn((...a: unknown[]) => getUser(...a)),
    // F077.1 — what `members.legal_name` holds for the signed-in member.
    legalNameRow: vi.fn(async (): Promise<{ data: { legal_name: string | null } | null; error: unknown }> => ({
      data: { legal_name: 'Rae Example' },
      error: null,
    })),
  }
})

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: legalNameRow }) }) }),
    auth: {
      getUser: authServer,
      getClaims: async () => {
        const { data, error } = await getUser()
        const user = data?.user
        return { data: user ? { claims: { sub: user.id, app_metadata: user.app_metadata ?? {} } } : null, error }
      },
    },
  }),
}))

import { proxy } from './proxy'
import type { NextRequest } from 'next/server'

function request(path = '/you', method = 'GET'): NextRequest {
  const cookies = new Map<string, { name: string; value: string }>()
  return {
    cookies: {
      getAll: () => [...cookies.values()],
      get: (name: string) => cookies.get(name),
      set: (name: string, value: string) => cookies.set(name, { name, value }),
    },
    method,
    nextUrl: new URL(`https://example.test${path}`),
    url: `https://example.test${path}`,
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
})

describe('proxy — a stale session must not 500 the request', () => {
  it('serves the request when the refresh token is invalid', async () => {
    getUser.mockRejectedValue(new Error('Invalid Refresh Token: Refresh Token Not Found'))
    const res = await proxy(request())
    expect(res).toBeDefined()
    expect(res.status).toBe(200)
  })

  // #557 — the seed behind Explore's order: a session cookie (no max-age), minted once.
  it('mints a session-only shuffle seed, and a new one when the visitor signs in', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const out = await proxy(request())
    const anon = out.cookies.get('su_seed')
    expect(anon?.value).toMatch(/^a\.[0-9a-z]{16}$/)
    expect(anon?.maxAge).toBeUndefined()
    expect(anon?.expires).toBeUndefined()

    getUser.mockResolvedValue({ data: { user: { id: 'm1' } }, error: null })
    const req = request()
    req.cookies.set('su_seed', anon!.value)
    const signedIn = await proxy(req)
    expect(signedIn.cookies.get('su_seed')?.value).toMatch(/^m\./)

    const again = request()
    again.cookies.set('su_seed', signedIn.cookies.get('su_seed')!.value)
    expect((await proxy(again)).cookies.get('su_seed')).toBeUndefined()
  })

  // #796 — a new visit rolls the visit cookie, so Explore knows what is new since the last one.
  it('starts a visit with each new seed, and remembers the one before', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const first = await proxy(request())
    const v1 = first.cookies.get('su_visit')
    expect(v1?.value).toMatch(/^\.[0-9a-z]+$/)
    expect(v1?.httpOnly).toBe(true)
    expect(v1?.maxAge).toBeGreaterThan(60 * 60 * 24 * 300)

    // Same visit: nothing rolls.
    const same = request()
    same.cookies.set('su_seed', first.cookies.get('su_seed')!.value)
    same.cookies.set('su_visit', v1!.value)
    expect((await proxy(same)).cookies.get('su_visit')).toBeUndefined()

    // A new visit (a new seed): the last visit is the one before.
    const next = request()
    next.cookies.set('su_visit', v1!.value)
    const v2 = (await proxy(next)).cookies.get('su_visit')!.value
    expect(v2.split('.')[0]).toBe(v1!.value.split('.')[1])
  })

  it('serves the request when getUser returns an auth error rather than throwing', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found' },
    })
    const res = await proxy(request())
    expect(res.status).toBe(200)
  })

  it('a signed-in request makes no round trip to the auth server (#791)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm1' } }, error: null })
    const res = await proxy(request('/explore'))
    expect(res.status).toBe(200)
    expect(authServer).not.toHaveBeenCalled()
  })

  it('still serves the request on a healthy session', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm1' } }, error: null })
    const res = await proxy(request())
    expect(res.status).toBe(200)
  })

  // An unexpected failure is not a stale cookie, and swallowing it would hide
  // a real outage — the DATABASE_URL lesson. It still must not 500 the page,
  // but it does not pass silently either.
  it('does not swallow an unexpected failure silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getUser.mockRejectedValue(new Error('upstream exploded'))
    const res = await proxy(request())
    expect(res.status).toBe(200)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('proxy — F081, the phone comes first', () => {
  const unverified = { id: 'm1', phone_confirmed_at: null, app_metadata: {} }

  it('sends a signed-in member with no verified phone to onboarding', async () => {
    process.env.PHONE_VERIFICATION_REQUIRED = '1'
    getUser.mockResolvedValue({ data: { user: unverified }, error: null })
    const res = await proxy(request('/explore'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.test/onboarding')
    delete process.env.PHONE_VERIFICATION_REQUIRED
  })

  it('does nothing while the requirement is off', async () => {
    delete process.env.PHONE_VERIFICATION_REQUIRED
    getUser.mockResolvedValue({ data: { user: unverified }, error: null })
    const res = await proxy(request('/explore'))
    expect(res.status).toBe(200)
  })
})

describe('proxy — F077.1, a signed-in member gives a legal name first', () => {
  const member = { id: 'm1', app_metadata: {} }
  const noName = { data: { legal_name: null }, error: null }

  // [guards F077.1 partial: the redirect of a signed-in member with no legal name; not the signup form]
  it('sends a signed-in member with no legal name to onboarding, whatever the phone flag says', async () => {
    delete process.env.PHONE_VERIFICATION_REQUIRED
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    legalNameRow.mockResolvedValueOnce(noName)
    const res = await proxy(request('/explore'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.test/onboarding')
  })

  it('treats a blank name as no name', async () => {
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    legalNameRow.mockResolvedValueOnce({ data: { legal_name: '  ' }, error: null })
    expect((await proxy(request('/you'))).status).toBe(307)
  })

  it('lets a member with a name through, and remembers it so later requests skip the lookup', async () => {
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    const first = await proxy(request('/explore'))
    expect(first.status).toBe(200)
    const mark = first.cookies.get('su_named')
    expect(mark?.value).toBe('m1')
    expect(mark?.httpOnly).toBe(true)

    legalNameRow.mockClear()
    const again = request('/explore')
    again.cookies.set('su_named', 'm1')
    expect((await proxy(again)).status).toBe(200)
    expect(legalNameRow).not.toHaveBeenCalled()
  })

  it("does not trust another member's mark", async () => {
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    legalNameRow.mockResolvedValueOnce(noName)
    const req = request('/explore')
    req.cookies.set('su_named', 'someone-else')
    expect((await proxy(req)).status).toBe(307)
  })

  it.each(['/onboarding', '/auth/login', '/api/health'])('leaves %s open so the name can be given', async (path) => {
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    legalNameRow.mockResolvedValue(noName)
    expect((await proxy(request(path))).status).toBe(200)
    legalNameRow.mockResolvedValue({ data: { legal_name: 'Rae Example' }, error: null })
  })

  it('exempts builders, signed-out visitors and non-GET requests', async () => {
    legalNameRow.mockResolvedValue(noName)
    getUser.mockResolvedValue({ data: { user: { id: 'b1', app_metadata: { builder: true } } }, error: null })
    expect((await proxy(request('/explore'))).status).toBe(200)
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await proxy(request('/explore'))).status).toBe(200)
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    expect((await proxy(request('/explore', 'POST'))).status).toBe(200)
    legalNameRow.mockResolvedValue({ data: { legal_name: 'Rae Example' }, error: null })
  })

  it('serves the page when the lookup fails rather than locking the member out', async () => {
    getUser.mockResolvedValue({ data: { user: member }, error: null })
    legalNameRow.mockResolvedValueOnce({ data: null, error: { message: 'down' } })
    expect((await proxy(request('/explore'))).status).toBe(200)
  })
})
