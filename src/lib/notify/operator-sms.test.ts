import { describe, it, expect, vi, afterEach } from 'vitest'
import { textOperator } from './operator-sms'

const ENV = {
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_FROM_NUMBER: '+19165550199',
  OPERATOR_PHONE: '+19165550198',
}

afterEach(() => vi.restoreAllMocks())

describe('F078 criterion 5 — texting Don', () => {
  it('sends one message through Twilio to the operator phone', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }))
    const res = await textOperator('hello', { env: ENV, fetch })
    expect(res).toEqual({ sent: true })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect(String(init.body)).toContain('To=%2B19165550198')
    expect(String(init.body)).toContain('Body=hello')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('AC123:token')}`)
  })

  it('sends nothing, and says so, when it is not configured', async () => {
    const fetch = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await textOperator('hello', { env: {}, fetch })).toEqual({ sent: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never throws when Twilio refuses — the report already stands', async () => {
    const fetch = vi.fn(async () => new Response('no', { status: 400 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await textOperator('hello', { env: ENV, fetch })).toEqual({ sent: false })
  })
})
