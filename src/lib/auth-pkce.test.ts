// Bug #67 — the outgoing PKCE code challenge must satisfy Supabase's rule.
//
// Sign-in is magic-link only, and the whole flow is PKCE. Nothing in this repo
// builds the challenge — `@supabase/ssr` does — which is exactly why nothing
// caught a sign-in that failed at the first request with
// "code challenge can only contain alphanumeric characters, hyphens, periods,
// underscores and tildes". The suite was green throughout.
//
// So this asserts the thing the server actually checks, against the real
// client from `@/lib/supabase` with only `fetch` stubbed — not a mock of the
// auth layer. A library upgrade that regressed the encoding, or a config
// change that switched the flow, fails here instead of at Don's phone.
//
// The rule is GoTrue's, copied from supabase/auth internal/api/pkce.go:
//     var codeChallengePattern = regexp.MustCompile("^[a-zA-Z._~0-9-]+$")
//     MinCodeChallengeLength = 43 ; MaxCodeChallengeLength = 128
// Base64url sits inside that set; standard base64 (`+`, `/`, `=`) does not.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test-project.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test'

// GoTrue's own constraint, not a restatement of what the client happens to emit.
const GOTRUE_CODE_CHALLENGE = /^[a-zA-Z._~0-9-]{43,128}$/

type Sent = { url: string; body: Record<string, unknown> }

/** Captures auth POSTs and answers them, so no network is touched. */
function stubFetch(): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      const url = String(input)
      let body: Record<string, unknown> = {}
      try {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      } catch {
        /* not JSON — recorded as {} */
      }
      sent.push({ url, body })
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return sent
}

async function client() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

const authCall = (sent: Sent[], path: string) =>
  sent.find((s) => s.url.includes(path))

beforeEach(() => {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('bug #67 — PKCE code challenge on the way out', () => {
  it('signInWithOtp sends a challenge Supabase will accept', async () => {
    const sent = stubFetch()
    await (await client()).auth.signInWithOtp({
      email: 'someone@example.com',
      options: { emailRedirectTo: 'https://example.test/auth/callback' },
    })

    const call = authCall(sent, '/auth/v1/otp')
    expect(call, 'no request was made to /auth/v1/otp').toBeDefined()

    const challenge = call!.body.code_challenge as string
    expect(challenge, 'PKCE flow must send a code_challenge').toBeTypeOf('string')
    expect(
      challenge,
      `code_challenge "${challenge}" violates GoTrue's rule — standard base64 ` +
        `(+ / =) instead of base64url is the usual cause`,
    ).toMatch(GOTRUE_CODE_CHALLENGE)
    expect(call!.body.code_challenge_method).toBe('s256')
  })

  it('signUp sends one too — the email-first path is the other front door', async () => {
    const sent = stubFetch()
    await (await client()).auth.signUp({
      email: 'someone@example.com',
      password: 'correct horse battery staple',
      options: { emailRedirectTo: 'https://example.test/auth/callback' },
    })

    const call = authCall(sent, '/auth/v1/signup')
    expect(call, 'no request was made to /auth/v1/signup').toBeDefined()
    expect(call!.body.code_challenge as string).toMatch(GOTRUE_CODE_CHALLENGE)
    expect(call!.body.code_challenge_method).toBe('s256')
  })

  it('the challenge is the SHA-256 of the verifier that was stored', async () => {
    // The half a charset fix can silently break. If the challenge is made
    // valid without the stored verifier still hashing to it, sign-in stops
    // failing here and starts failing at the callback instead — later, and
    // harder to read.
    const sent = stubFetch()
    await (await client()).auth.signInWithOtp({
      email: 'someone@example.com',
      options: { emailRedirectTo: 'https://example.test/auth/callback' },
    })

    const challenge = authCall(sent, '/auth/v1/otp')!.body.code_challenge as string

    const raw = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.split('=')[0].endsWith('-code-verifier'))
    expect(raw, 'no code verifier was stored for the exchange').toBeDefined()

    let verifier = decodeURIComponent(raw!.slice(raw!.indexOf('=') + 1))
    if (verifier.startsWith('base64-')) {
      verifier = atob(verifier.slice('base64-'.length))
    }
    verifier = verifier.replace(/^"|"$/g, '')

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    )
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    expect(challenge, 'challenge does not correspond to the stored verifier').toBe(
      expected,
    )
  })
})
