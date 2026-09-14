// Bug #69 — the callback path, which had no test at all.
//
// This is where a magic link lands and where the PKCE code verifier is
// consumed. Don hit "PKCE code verifier not found in storage" here, and the
// suite was green: nothing covered this file, nothing covered `useAuth`,
// `MagicLinkForm`, `lib/supabase.ts` or `proxy.ts`.
//
// Two things are asserted that are easy to break and expensive to notice:
//
//   1. The route builds its client through `@/lib/supabase-server`, which is
//      `createServerClient` with the cookie adapter. The verifier is written
//      as a cookie by the browser client, so a raw `supabase-js` client here
//      reads no cookies and every exchange fails with exactly the error Don
//      saw. That swap is one import line and looks harmless in review.
//
//   2. The `token_hash` branch still works and still takes its type off the
//      link. It is the only branch that survives the link being opened in a
//      different browser than the one that started sign-in — a different mail
//      app, a private window, a phone. It is currently unreachable in
//      production because Supabase's default Magic Link template emits
//      `{{ .ConfirmationURL }}` (a PKCE `?code=` link) rather than a token
//      hash, so nothing exercises it and nothing would notice it rotting.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const exchangeCodeForSession = vi.fn()
const verifyOtp = vi.fn()
const createClient = vi.fn(async () => ({
  auth: { exchangeCodeForSession, verifyOtp },
}))

vi.mock('@/lib/supabase-server', () => ({ createClient }))

const { GET } = await import('./route')

const call = (qs: string) =>
  GET(new Request(`https://preview.example.app/auth/callback${qs}`))

const locationOf = (res: { headers: Headers }) =>
  new URL(res.headers.get('location') ?? '')

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ error: null })
  verifyOtp.mockResolvedValue({ error: null })
})

describe('bug #69 — auth callback', () => {
  it('reads through the cookie-backed server client, not a raw one', async () => {
    // The regression guard. If the verifier cannot be read, every PKCE
    // sign-in fails and the member is told their link is broken.
    await call('?code=abc123')
    expect(
      createClient,
      'the callback must use @/lib/supabase-server so the verifier cookie is readable',
    ).toHaveBeenCalled()
  })

  it('exchanges a PKCE code and sends the member on to next', async () => {
    const res = await call('?code=abc123&next=%2Fyou')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(locationOf(res).pathname).toBe('/you')
  })

  it('surfaces a failed exchange on the login page instead of a blank screen', async () => {
    // This is the exact failure Don met. The member must land somewhere that
    // explains itself and lets them ask for another link.
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'PKCE code verifier not found in storage.' },
    })
    const res = await call('?code=abc123')
    const url = locationOf(res)
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('error')).toContain('code verifier')
  })

  it('verifies a token_hash link — the only cross-browser path', async () => {
    const res = await call('?token_hash=xyz&type=signup&next=%2Fonboarding')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'signup' })
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(locationOf(res).pathname).toBe('/onboarding')
  })

  it('takes the otp type off the link rather than hardcoding one', async () => {
    // A first-time link is `signup`, a returning one `magiclink`. Pinning
    // either rejects the other, and the member cannot tell which they have.
    await call('?token_hash=xyz&type=recovery')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'recovery' })
  })

  it('falls back to magiclink when the link carries no usable type', async () => {
    await call('?token_hash=xyz&type=not-a-real-type')
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'xyz', type: 'magiclink' })
  })

  it('explains a link that carries no token at all', async () => {
    const res = await call('')
    const url = locationOf(res)
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('error')).toMatch(/missing its token/i)
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('passes through an expired-link error from Supabase', async () => {
    const res = await call('?error_description=Email+link+is+invalid+or+has+expired')
    const url = locationOf(res)
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('error')).toMatch(/expired/i)
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('refuses to bounce an authenticated member off-site', async () => {
    // `next` arrives from a URL an attacker can compose and send.
    const res = await call('?code=abc123&next=https%3A%2F%2Fevil.example%2Fsteal')
    const url = locationOf(res)
    expect(url.origin).toBe('https://preview.example.app')
    expect(url.href).not.toContain('evil.example')
  })
})
