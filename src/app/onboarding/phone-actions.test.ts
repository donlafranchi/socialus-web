// #570 (F081.9) — the check that runs before a code is sent.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, blocked } = vi.hoisted(() => ({ getUser: vi.fn(), blocked: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/lib/auth/line-type', () => ({ phoneIsBlocked: blocked }))

import { checkPhoneAction } from './phone-actions'

beforeEach(() => {
  getUser.mockReset()
  blocked.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
})

describe('checkPhoneAction', () => {
  // [guards F081.9 partial: refused before any code is sent, with a plain message asking for a mobile number]
  it('refuses a VoIP number with plain words asking for a mobile number', async () => {
    blocked.mockResolvedValue(true)
    const res = await checkPhoneAction('+19165550134')
    expect(res).toEqual({ ok: false, reason: 'voip' })
  })

  it('lets any other number on', async () => {
    blocked.mockResolvedValue(false)
    expect(await checkPhoneAction('+19165550134')).toEqual({ ok: true })
  })

  it('needs a signed-in member, and looks nothing up for anyone else', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(checkPhoneAction('+19165550134')).rejects.toThrow(/signed in/i)
    expect(blocked).not.toHaveBeenCalled()
  })
})
