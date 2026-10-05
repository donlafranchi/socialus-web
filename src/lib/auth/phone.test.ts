// F081 — a member is verified as a person by a text-message code to their
// phone, at signup (Don, 2026-10-01). Builders are the named exception.

import { describe, it, expect } from 'vitest'
import { needsPhoneVerification, normalizeUsPhone } from './phone'

describe('normalizeUsPhone', () => {
  it('accepts the ways people type a US number and returns E.164', () => {
    for (const raw of ['916-555-0134', '(916) 555 0134', '9165550134', '+1 916 555 0134', '1-916-555-0134']) {
      expect(normalizeUsPhone(raw)).toBe('+19165550134')
    }
  })
  it('refuses anything that is not ten US digits', () => {
    for (const raw of ['', '555-0134', '916555013', '+44 20 7946 0958', '0165550134', 'call me']) {
      expect(normalizeUsPhone(raw)).toBeNull()
    }
  })
})

describe('needsPhoneVerification', () => {
  const on = { PHONE_VERIFICATION_REQUIRED: '1' }
  const member = { phone_confirmed_at: null, app_metadata: {} }
  const ask = (over: Partial<Parameters<typeof needsPhoneVerification>[0]> = {}) =>
    needsPhoneVerification({ user: member, pathname: '/explore', method: 'GET', env: on, ...over })

  // [guards F081.1 partial: the gate only; sending and checking the code is Supabase's]
  it('sends a signed-in member with no verified phone to verify it', () => {
    expect(ask()).toBe(true)
  })
  it('lets a verified member through', () => {
    expect(ask({ user: { phone_confirmed_at: '2026-10-01T00:00:00Z', app_metadata: {} } })).toBe(false)
  })
  it('never asks a builder', () => {
    expect(ask({ user: { phone_confirmed_at: null, app_metadata: { builder: true } } })).toBe(false)
  })
  it('never asks someone signed out', () => {
    expect(ask({ user: null })).toBe(false)
  })
  it('leaves onboarding, sign-in and the API reachable', () => {
    for (const pathname of ['/onboarding', '/auth/login', '/auth/callback', '/api/health/db']) {
      expect(ask({ pathname })).toBe(false)
    }
  })
  it('only redirects page loads, never a form post', () => {
    expect(ask({ method: 'POST' })).toBe(false)
  })
  it('is off until the SMS provider is switched on', () => {
    expect(ask({ env: {} })).toBe(false)
  })
})
