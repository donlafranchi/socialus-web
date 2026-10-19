import { describe, it, expect, vi, afterEach } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { authCookieOptions } from './cookie-options'

// Stay signed in at least 30 days (the PM, 2026-10-18): the session cookie Supabase writes on
// sign-in is persistent, sameSite=lax and, on https, Secure.
afterEach(() => vi.unstubAllGlobals())

describe('the session cookie', () => {
  it('is written to last well past 30 days, sameSite=lax and Secure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'u', aud: 'authenticated' }), { status: 200 })))
    const set: { name: string; options: Record<string, unknown> }[] = []
    const client = createServerClient('https://x.supabase.co', 'key', {
      cookieOptions: authCookieOptions(true),
      cookies: { getAll: () => [], setAll: (c) => { set.push(...c) } },
    })
    const exp = Math.floor(Date.now() / 1000) + 3600
    const jwt = `e30.${Buffer.from(JSON.stringify({ sub: 'u', exp })).toString('base64url')}.sig`
    const { error } = await client.auth.setSession({ access_token: jwt, refresh_token: 'r' })
    expect(error).toBeNull()
    const cookie = set.find((c) => c.name.startsWith('sb-x-auth-token') && c.options.maxAge)
    expect(cookie).toBeDefined()
    expect(cookie!.options.maxAge as number).toBeGreaterThanOrEqual(30 * 24 * 60 * 60)
    expect(cookie!.options.sameSite).toBe('lax')
    expect(cookie!.options.secure).toBe(true)
  })
})
