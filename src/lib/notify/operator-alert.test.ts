// Dispatch call (well-worn, 2026-10-12, #707): until a Twilio number exists, an urgent-report alert
// (Threat of harm, Sensitive content) goes by email through Resend to ADMIN_EMAILS; once the Twilio
// values exist it goes by SMS, automatically. Never throws: the report and the hide already stand.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { alertOperator } from './operator-alert'

const SMS = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'token', TWILIO_FROM_NUMBER: '+18885550199', OPERATOR_PHONE: '+19165550198' }
const MAIL = { RESEND_API_KEY: 're_test', ADMIN_EMAILS: 'don@example.test', FOLLOW_EMAIL_FROM: 'SocialUs <alerts@example.test>' }

const ok = (status = 200) => vi.fn(async () => new Response('{}', { status }))
const sentTo = (f: ReturnType<typeof vi.fn>) => (f.mock.calls as unknown as [string, RequestInit][]).map(([url]) => url)

afterEach(() => vi.restoreAllMocks())

describe('alertOperator', () => {
  // [guards F078.5 partial: with no Twilio number the alert still reaches the operator, by email]
  it('emails ADMIN_EMAILS through Resend when there is no Twilio number', async () => {
    const f = ok()
    const res = await alertOperator('a "Threat of harm" report came in', { env: MAIL, fetch: f })
    expect(res).toEqual({ sent: true, via: 'email' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ from: 'SocialUs <alerts@example.test>', to: ['don@example.test'], text: 'a "Threat of harm" report came in' })
    expect(body.subject).toMatch(/urgent report/i)
  })

  it('writes to every address in ADMIN_EMAILS, comma separated', async () => {
    const f = ok()
    await alertOperator('x', { env: { ...MAIL, ADMIN_EMAILS: 'a@example.test, b@example.test ,' }, fetch: f })
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).to).toEqual(['a@example.test', 'b@example.test'])
  })

  it('sends from onboarding@resend.dev when no sender is set', async () => {
    const f = ok()
    await alertOperator('x', { env: { RESEND_API_KEY: 're_test', ADMIN_EMAILS: 'a@example.test' }, fetch: f })
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).from).toBe('SocialUs <onboarding@resend.dev>')
  })

  // [guards F078.5 partial: SMS is used automatically once the Twilio values exist]
  it('texts instead, and sends no email, once the Twilio values exist', async () => {
    const f = ok(201)
    const res = await alertOperator('hello', { env: { ...SMS, ...MAIL }, fetch: f })
    expect(res).toEqual({ sent: true, via: 'sms' })
    expect(sentTo(f)).toEqual(['https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json'])
  })

  it('falls back to email when the text is refused, so nothing waits on Twilio', async () => {
    const f = vi.fn(async (url: string) => new Response('{}', { status: String(url).includes('twilio') ? 400 : 200 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await alertOperator('hello', { env: { ...SMS, ...MAIL }, fetch: f as never })).toEqual({ sent: true, via: 'email' })
    expect(sentTo(f as never)).toEqual(['https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json', 'https://api.resend.com/emails'])
  })

  it('a half-set Twilio config is not SMS: it falls to email', async () => {
    const f = ok()
    const res = await alertOperator('hello', { env: { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'token', ...MAIL }, fetch: f })
    expect(res).toEqual({ sent: true, via: 'email' })
  })

  it('sends nothing, and says so, when neither is configured', async () => {
    const f = ok()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await alertOperator('hello', { env: {}, fetch: f })).toEqual({ sent: false, via: null })
    expect(f).not.toHaveBeenCalled()
  })

  it('never throws when Resend refuses or is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await alertOperator('x', { env: MAIL, fetch: ok(422) })).toEqual({ sent: false, via: null })
    expect(await alertOperator('x', { env: MAIL, fetch: vi.fn(async () => { throw new Error('offline') }) })).toEqual({ sent: false, via: null })
  })
})
