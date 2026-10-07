import { describe, it, expect, afterEach, vi } from 'vitest'
import { siteOrigin, authRedirectUrl } from './site-url'

const original = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = original
  vi.unstubAllGlobals()
})

describe('siteOrigin', () => {
  it('prefers the configured site URL and strips a trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org/'
    expect(siteOrigin()).toBe('https://www.socialus.org')
  })

  it('falls back to the browser origin when unset (local dev)', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } })
    expect(siteOrigin()).toBe('http://localhost:3000')
  })
})

describe('authRedirectUrl', () => {
  // These two asserted the canonical origin with no window stubbed, which read
  // as "the redirect is always canonical". That is the bug #70 behaviour. The
  // intent — the callback path, and `next` encoding — is kept; the browser is
  // now stated to be ON the canonical host, which is the case they describe.
  it('points at the callback route on the canonical origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    vi.stubGlobal('window', { location: { origin: 'https://www.socialus.org' } })
    expect(authRedirectUrl()).toBe('https://www.socialus.org/auth/callback')
  })

  it('encodes the post-login destination', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    vi.stubGlobal('window', { location: { origin: 'https://www.socialus.org' } })
    expect(authRedirectUrl('/you/sell')).toBe(
      'https://www.socialus.org/auth/callback?next=%2Fyou%2Fsell',
    )
  })
})

// Bug #70 — sign-in works on socialus.org and fails on a Vercel preview with
// "PKCE code verifier not found in storage".
//
// The verifier is a HOST-ONLY cookie. `createBrowserClient` writes it through
// `document.cookie` with no Domain attribute, so it belongs to the exact
// origin the browser was on when sign-in started and to nothing else. The
// code can therefore only be redeemed on that same origin.
//
// Two ways this file sent the member somewhere else:
//
//   1. `NEXT_PUBLIC_SITE_URL` is documented as Production-scope, but Vercel's
//      default when adding a variable is All Environments. Scoped that way it
//      is also set on preview, and `siteOrigin()` returns the canonical host
//      while the browser is on `*.vercel.app`. The verifier is written on the
//      preview host and the link comes back to production, which holds no
//      verifier.
//
//   2. Server-side, `VERCEL_PROJECT_PRODUCTION_URL` was consulted before
//      `VERCEL_URL`. Vercel sets the former on EVERY environment — it is the
//      project's production domain, not this deployment's — so a preview
//      render resolved to the production origin too.
//
// The fix separates the two jobs this module was doing. A canonical origin is
// right for anything published (OG tags, share links). An auth redirect is not
// published: it must name the origin holding the verifier, which is the origin
// the browser is on.
describe('bug #70 — auth redirect must match the host holding the verifier', () => {
  it('uses the browser origin on a preview, even when a canonical site URL is configured', () => {
    // The All-Environments misconfiguration: canonical value present on preview.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    vi.stubGlobal('window', {
      location: { origin: 'https://socialus-web-git-f072-socialus.vercel.app' },
    })

    expect(authRedirectUrl()).toBe(
      'https://socialus-web-git-f072-socialus.vercel.app/auth/callback',
    )
  })

  it('still points at the canonical origin in production, where they agree', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    vi.stubGlobal('window', { location: { origin: 'https://www.socialus.org' } })

    expect(authRedirectUrl('/you/sell')).toBe(
      'https://www.socialus.org/auth/callback?next=%2Fyou%2Fsell',
    )
  })

  it('keeps the canonical origin for published links on a preview', () => {
    // OG tags and share links are the opposite case: they must stay canonical
    // even when rendered from a preview deployment.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    vi.stubGlobal('window', {
      location: { origin: 'https://socialus-web-git-f072-socialus.vercel.app' },
    })

    expect(siteOrigin()).toBe('https://www.socialus.org')
  })
})

describe('bug #70 — server-side origin on a preview deployment', () => {
  const vercelEnv = process.env.VERCEL_ENV
  const vercelUrl = process.env.VERCEL_URL
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL

  afterEach(() => {
    process.env.VERCEL_ENV = vercelEnv
    process.env.VERCEL_URL = vercelUrl
    process.env.VERCEL_PROJECT_PRODUCTION_URL = prodUrl
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV
    if (vercelUrl === undefined) delete process.env.VERCEL_URL
    if (prodUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  })

  it('resolves to this deployment, not the project production domain', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    // jsdom always supplies a window; a server render has none.
    vi.stubGlobal('window', undefined)
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_URL = 'socialus-web-abc123-socialus.vercel.app'
    // Vercel sets this on preview too. It names production, never this deploy.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.socialus.org'

    expect(siteOrigin()).toBe('https://socialus-web-abc123-socialus.vercel.app')
  })

  it('still resolves to the production domain on a production deployment', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    vi.stubGlobal('window', undefined)
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_URL = 'socialus-web-xyz789-socialus.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.socialus.org'

    expect(siteOrigin()).toBe('https://www.socialus.org')
  })
})

describe('#444 — metadataBase, so every published URL names the canonical host', () => {
  it('is the configured site URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.socialus.org/')
    const { siteMetadataBase } = await import('./site-url')
    expect(siteMetadataBase().href).toBe('https://www.socialus.org/')
  })
})
