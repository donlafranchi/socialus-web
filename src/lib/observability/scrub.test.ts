// #490 — error tracking must never carry a member's details off the platform.
// Every event is scrubbed before it leaves (accepted risk 2026-09-17, due 2026-10-16).

import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubEvent, scrubText } from './scrub'

describe('scrubText', () => {
  it('removes email addresses and phone numbers', () => {
    expect(scrubText('failed for maya@example.com, call (916) 555-0134 or 916-555-0134')).toBe(
      'failed for [email], call [phone] or [phone]',
    )
  })
  it('leaves ordinary text alone', () => {
    expect(scrubText('TypeError: Cannot read properties of undefined (reading "name")')).toBe(
      'TypeError: Cannot read properties of undefined (reading "name")',
    )
  })
})

describe('scrubEvent', () => {
  const event = {
    message: 'Sign-in failed for maya@example.com',
    user: { id: 'u1', email: 'maya@example.com', ip_address: '1.2.3.4', username: 'maya' },
    request: {
      url: 'https://www.socialus.org/explore?q=maya%40example.com&zip=95819',
      query_string: 'q=maya&zip=95819',
      cookies: { 'sb-access-token': 'secret' },
      headers: { cookie: 'sb=secret', authorization: 'Bearer x', 'user-agent': 'Mozilla' },
      data: { legalName: 'Maya Rivera', zip: '95819' },
    },
    exception: { values: [{ type: 'Error', value: 'No row for maya@example.com' }] },
    breadcrumbs: [{ category: 'fetch', message: 'GET /api?email=maya@example.com', data: { url: '/x?zip=95819' } }],
    extra: { form: { legalName: 'Maya Rivera' } },
    contexts: { device: { name: 'iPhone' } },
    tags: { route: '/explore' },
  }

  it('drops the user entirely', () => {
    expect(scrubEvent(event as unknown as ErrorEvent).user).toBeUndefined()
  })

  it('drops cookies, auth headers, request bodies and the query string', () => {
    const r = scrubEvent(event as unknown as ErrorEvent).request!
    expect(r.cookies).toBeUndefined()
    expect(r.data).toBeUndefined()
    expect(r.query_string).toBeUndefined()
    expect(r.headers).toEqual({ 'user-agent': 'Mozilla' })
    expect(r.url).toBe('https://www.socialus.org/explore')
  })

  it('scrubs the message, exception values and breadcrumbs, and drops free-form extras', () => {
    const out = scrubEvent(event as unknown as ErrorEvent)
    expect(out.message).toBe('Sign-in failed for [email]')
    expect(out.exception!.values![0]!.value).toBe('No row for [email]')
    expect(out.breadcrumbs![0]!.message).toBe('GET /api?email=[email]')
    expect(out.breadcrumbs![0]!.data).toBeUndefined()
    expect(out.extra).toBeUndefined()
  })

  it('keeps what an engineer needs: the route tag, the device kind and the exception type', () => {
    const out = scrubEvent(event as unknown as ErrorEvent)
    expect(out.tags).toEqual({ route: '/explore' })
    expect(out.contexts).toEqual({ device: { name: 'iPhone' } })
    expect(out.exception!.values![0]!.type).toBe('Error')
  })

  it('leaves no email or legal name anywhere in the serialised event', () => {
    const text = JSON.stringify(scrubEvent(event as unknown as ErrorEvent))
    expect(text).not.toMatch(/maya@example\.com|Maya Rivera|95819|secret/)
  })
})
