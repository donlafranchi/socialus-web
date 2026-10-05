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

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))

import { proxy } from './proxy'
import type { NextRequest } from 'next/server'

function request(path = '/you', method = 'GET'): NextRequest {
  const cookies = new Map<string, { name: string; value: string }>()
  return {
    cookies: {
      getAll: () => [...cookies.values()],
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

  it('serves the request when getUser returns an auth error rather than throwing', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found' },
    })
    const res = await proxy(request())
    expect(res.status).toBe(200)
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
