// /landing — the zip resolves to a metro and the existing anonymous handler
// stores the address; a zip outside every metro stores nothing.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { metroForZip, joinAnonymous } = vi.hoisted(() => ({ metroForZip: vi.fn(), joinAnonymous: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/signup/zip-metro', () => ({ metroForZip }))
vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, metroWaitlistJoinAnonymous: joinAnonymous }
})

import { joinLandingWaitlistAction } from './actions'

const base = { email: 'a@b.co', zip: '95814', runsSomething: false, wouldHelp: true }

beforeEach(() => {
  metroForZip.mockReset()
  joinAnonymous.mockReset()
})

describe('joinLandingWaitlistAction', () => {
  it('rejects a zip that is not five digits before reading anything', async () => {
    expect(await joinLandingWaitlistAction({ ...base, zip: '9581' })).toEqual({ kind: 'error', field: 'zip', message: 'Enter a 5-digit zip code.' })
    expect(metroForZip).not.toHaveBeenCalled()
  })

  it('stores nothing for a zip outside every metro', async () => {
    metroForZip.mockResolvedValue(null)
    expect(await joinLandingWaitlistAction(base)).toEqual({ kind: 'outside' })
    expect(joinAnonymous).not.toHaveBeenCalled()
  })

  it('joins the metro waitlist, business box as creator, and reports open or waiting', async () => {
    metroForZip.mockResolvedValue({ id: 'm1', name: 'Metro' })
    joinAnonymous.mockResolvedValue({ open: false, metroId: 'm1', metroName: 'Metro' })
    expect(await joinLandingWaitlistAction({ ...base, runsSomething: true })).toEqual({ kind: 'waiting' })
    expect(joinAnonymous).toHaveBeenCalledWith(expect.anything(), { metroId: 'm1', email: 'a@b.co', role: 'creator' })

    joinAnonymous.mockResolvedValue({ open: true, metroId: 'm1', metroName: 'Metro' })
    expect(await joinLandingWaitlistAction(base)).toEqual({ kind: 'open' })
    expect(joinAnonymous).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ role: 'patron' }))
  })
})
