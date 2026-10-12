// #570 (F081.9) — Twilio Lookup Line Type Intelligence: a non-fixed VoIP number (Google Voice and
// the like) is refused before any code is sent. No credentials, or any failure, is not a refusal:
// the lookup is a stub until the Twilio keys exist (#707), and it never blocks a real person on an outage.

import { describe, it, expect, vi } from 'vitest'
import { phoneIsBlocked } from './line-type'

const ENV = { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok' }
const lookup = (type: string | null, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ line_type_intelligence: type === null ? null : { type } }), { status }))

describe('phoneIsBlocked', () => {
  // [guards F081.9 partial: a non-fixed VoIP number is refused]
  it('refuses a non-fixed VoIP number', async () => {
    expect(await phoneIsBlocked('+19165550134', { env: ENV, fetch: lookup('nonFixedVoip') })).toBe(true)
  })

  // [guards F081.9 partial: a mobile number still gets its code]
  it.each(['mobile', 'landline', 'fixedVoip', 'personal', 'tollFree', 'unknown'])('lets a %s number through', async (type) => {
    expect(await phoneIsBlocked('+19165550134', { env: ENV, fetch: lookup(type) })).toBe(false)
  })

  it('asks Twilio Lookup v2 for the line type of that one number, with the account as basic auth', async () => {
    const f = lookup('mobile')
    await phoneIsBlocked('+19165550134', { env: ENV, fetch: f })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://lookups.twilio.com/v2/PhoneNumbers/%2B19165550134?Fields=line_type_intelligence')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('ACtest:tok')}`)
  })

  it('without Twilio credentials it makes no call and blocks nothing (the stub)', async () => {
    const f = lookup('nonFixedVoip')
    expect(await phoneIsBlocked('+19165550134', { env: {}, fetch: f })).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('a refused, failed or empty lookup blocks nothing', async () => {
    expect(await phoneIsBlocked('+19165550134', { env: ENV, fetch: lookup(null) })).toBe(false)
    expect(await phoneIsBlocked('+19165550134', { env: ENV, fetch: lookup('nonFixedVoip', 503) })).toBe(false)
    expect(await phoneIsBlocked('+19165550134', { env: ENV, fetch: vi.fn(async () => { throw new Error('offline') }) })).toBe(false)
  })

  it('only looks up a well-formed US number', async () => {
    const f = lookup('nonFixedVoip')
    expect(await phoneIsBlocked('9165550134', { env: ENV, fetch: f })).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
