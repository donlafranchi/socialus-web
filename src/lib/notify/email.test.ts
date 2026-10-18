// #945 — reminder email: only with a key and a verified sender; carries a List-Unsubscribe link; never throws.
import { describe, it, expect, vi } from 'vitest'
import { sendMemberEmail } from './email'

const ENV = { RESEND_API_KEY: 're_test', FOLLOW_EMAIL_FROM: 'SocialUs <reminders@socialus.org>' }

describe('sendMemberEmail', () => {
  it('sends through Resend with the stop link as List-Unsubscribe', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await sendMemberEmail('a@example.test', 'S', 'T', { env: ENV, fetch: f, unsubscribe: 'https://socialus.org/g/x?via=reminder&r=1' })).toBe(true)
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toMatchObject({ from: ENV.FOLLOW_EMAIL_FROM, to: ['a@example.test'], subject: 'S', text: 'T', headers: { 'List-Unsubscribe': '<https://socialus.org/g/x?via=reminder&r=1>' } })
  })
  it('sends nothing without a verified sender (the test sender only reaches the account owner)', async () => {
    const f = vi.fn()
    expect(await sendMemberEmail('a@example.test', 'S', 'T', { env: { RESEND_API_KEY: 're_test' }, fetch: f })).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendMemberEmail('a@example.test', 'S', 'T', { env: ENV, fetch: vi.fn(async () => { throw new Error('down') }) })).toBe(false)
  })
})
