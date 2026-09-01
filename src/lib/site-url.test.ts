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
  it('points at the callback route on the canonical origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    expect(authRedirectUrl()).toBe('https://www.socialus.org/auth/callback')
  })

  it('encodes the post-login destination', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
    expect(authRedirectUrl('/you/sell')).toBe(
      'https://www.socialus.org/auth/callback?next=%2Fyou%2Fsell',
    )
  })
})
