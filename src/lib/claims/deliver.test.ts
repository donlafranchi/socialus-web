import { describe, it, expect, vi } from 'vitest'
import { sendClaimCode } from './deliver'

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }))

describe('#987 delivering a claim code', () => {
  it('emails the code to the claimant through Resend', async () => {
    const fetch = ok()
    const sent = await sendClaimCode({ method: 'email', target: 'rosa@rosas.com', code: '123456', pageName: "Rosa's" },
      { env: { RESEND_API_KEY: 'k', FOLLOW_EMAIL_FROM: 'hi@socialus.org' }, fetch })
    expect(sent).toBe(true)
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.to).toEqual(['rosa@rosas.com'])
    expect(body.text).toContain('123456')
  })

  it('texts through Twilio only when it is configured', async () => {
    expect(await sendClaimCode({ method: 'phone', target: '+19165550100', code: '123456', pageName: 'X' }, { env: {}, fetch: ok() })).toBe(false)
    const fetch = ok()
    expect(await sendClaimCode({ method: 'phone', target: '+19165550100', code: '123456', pageName: 'X' },
      { env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+19165550000' }, fetch })).toBe(true)
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json')
  })

  it('an unset sender sends nothing', async () => {
    expect(await sendClaimCode({ method: 'email', target: 'a@b.com', code: '1', pageName: 'X' }, { env: {}, fetch: ok() })).toBe(false)
  })
})
