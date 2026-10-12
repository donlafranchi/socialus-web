// /landing — the zip resolves to a market and the existing anonymous handler
// stores the address; a zip outside every metro stores nothing.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { marketForZip, joinAnonymous } = vi.hoisted(() => ({ marketForZip: vi.fn(), joinAnonymous: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/signup/zip-market', () => ({ marketForZip }))
vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, metroWaitlistJoinAnonymous: joinAnonymous }
})

import { joinLandingWaitlistAction } from './actions'

const base = { email: 'a@b.co', zip: '95814', runsSomething: false, wouldHelp: true }

beforeEach(() => {
  marketForZip.mockReset()
  joinAnonymous.mockReset()
})

describe('joinLandingWaitlistAction', () => {
  it('rejects a zip that is not five digits before reading anything', async () => {
    expect(await joinLandingWaitlistAction({ ...base, zip: '9581' })).toEqual({ kind: 'error', field: 'zip', message: 'Enter a 5-digit zip code.' })
    expect(marketForZip).not.toHaveBeenCalled()
  })

  // [guards F103.2 partial: an unknown zip is refused with the exact words]
  it('refuses a zip nobody knows, with the exact words, and stores nothing', async () => {
    marketForZip.mockResolvedValue(null)
    expect(await joinLandingWaitlistAction(base)).toEqual({ kind: 'error', field: 'zip', message: "We don't recognize that zip, try again." })
    expect(joinAnonymous).not.toHaveBeenCalled()
  })

  it('joins the waitlist of the market the zip decided, business box as creator, and reports open or waiting', async () => {
    marketForZip.mockResolvedValue({ key: 'county-06115', name: 'Yuba County, CA', open: false, metroId: 'm1' })
    joinAnonymous.mockResolvedValue({ open: false, metroId: 'm1', metroName: 'Yuba County, CA' })
    expect(await joinLandingWaitlistAction({ ...base, runsSomething: true })).toEqual({ kind: 'waiting' })
    expect(joinAnonymous).toHaveBeenCalledWith(expect.anything(), { metroId: 'm1', email: 'a@b.co', role: 'creator' })

    marketForZip.mockResolvedValue({ key: 'sacramento', name: 'Sacramento', open: true, metroId: 'm1' })
    joinAnonymous.mockResolvedValue({ open: true, metroId: 'm1', metroName: 'Sacramento' })
    expect(await joinLandingWaitlistAction(base)).toEqual({ kind: 'open' })
    expect(joinAnonymous).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ role: 'patron' }))
  })
})
