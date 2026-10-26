// Guarded here:
//   1. A signup whose `members` row was never created (auth-signup webhook not
//      configured — migration 006 raises a WARNING and returns) must fail loudly
//      at the profile step, not silently succeed.
//   2. #205 / F081 criterion 7 — onboarding writes no place for anyone; a member's
//      home is the metro their zip decided, or nothing.
//   3. #222 — four fields and the 18+ box; the zip decides the metro.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, updateUser, signupProfileSet, placeInterestAdd, marketForZip } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signupProfileSet: vi.fn(),
  placeInterestAdd: vi.fn(),
  marketForZip: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser, updateUser } })),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: vi.fn((o: unknown) => o) }))
vi.mock('@/lib/signup/zip-market', () => ({ marketForZip }))
vi.mock('@/actions', () => ({
  memberSignupProfileSet: signupProfileSet,
  memberPlaceInterestAdd: placeInterestAdd,
  memberInterestsAdd: vi.fn(),
  ActionError: class ActionError extends Error {},
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/actions/_lib/errors', () => ({ NotFoundError: class NotFoundError extends Error {} }))

import { finishOnboardingAction, completeOnboardingAction } from './actions'
import { NotFoundError } from '@/actions/_lib/errors'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const SAC = { key: 'sacramento', name: 'Sacramento', open: true, metroId: '22222222-2222-2222-2222-222222222222' }
const INPUT = { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true }

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockResolvedValue({ data: {}, error: null })
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
  signupProfileSet.mockResolvedValue({ memberId: MEMBER, metroId: SAC.metroId })
  marketForZip.mockResolvedValue(SAC)
})

describe('completeOnboardingAction', () => {
  it('saves the four fields and the market the zip decided, and says which', async () => {
    const res = await completeOnboardingAction(INPUT)
    expect(res).toEqual({ ok: true, metro: { name: SAC.name }, waiting: null })
    expect(marketForZip).toHaveBeenCalledWith(expect.anything(), '95819')
    // #1090 — not marked onboarded yet: that refreshes the page, whose gate sends an onboarded
    // member home before the market, interests or waiting screens can show.
    expect(updateUser).not.toHaveBeenCalled()
    expect(signupProfileSet).toHaveBeenCalledWith(
      { actingMemberId: MEMBER },
      { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true, metroId: SAC.metroId },
    )
  })

  // [guards F103.2 partial: an unknown zip is refused with the exact words and nothing is saved]
  it('refuses a zip nobody knows, with the exact words, and saves nothing', async () => {
    marketForZip.mockResolvedValue(null)
    const res = await completeOnboardingAction({ ...INPUT, zip: '00000' })
    expect(res).toEqual({ ok: false, field: 'zip', message: "We don't recognize that zip, try again." })
    expect(signupProfileSet).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  // [guards F103.3 partial: a waiting market is named, nothing is picked, and no home is saved]
  it('a zip in a waiting market names it, hands over the row to wait on, and saves no home', async () => {
    marketForZip.mockResolvedValue({ key: 'county-06115', name: 'Yuba County, CA', open: false, metroId: 'metro-yuba' })
    const res = await completeOnboardingAction({ ...INPUT, zip: '95901' })
    expect(res).toEqual({ ok: true, metro: null, waiting: { metroId: 'metro-yuba', name: 'Yuba County, CA', key: 'county-06115' } })
    expect(signupProfileSet.mock.calls[0]![1].metroId).toBeNull()
  })

  // [guards F081.7]
  it('writes no home place for anyone', async () => {
    await completeOnboardingAction(INPUT)
    expect(placeInterestAdd).not.toHaveBeenCalled()
  })

  it('refuses without the 18+ box and touches nothing', async () => {
    const res = await completeOnboardingAction({ ...INPUT, adultConfirmed: false })
    expect(res).toMatchObject({ ok: false, field: 'adultConfirmed' })
    expect(signupProfileSet).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses a bad zip and an empty legal name, naming the field', async () => {
    expect(await completeOnboardingAction({ ...INPUT, zip: '958' })).toMatchObject({ ok: false, field: 'zip' })
    expect(await completeOnboardingAction({ ...INPUT, legalName: '' })).toMatchObject({ ok: false, field: 'legalName' })
    expect(signupProfileSet).not.toHaveBeenCalled()
  })

  it('reports failure, and marks nothing, when there is no members row', async () => {
    signupProfileSet.mockRejectedValue(new NotFoundError('no such member'))
    const res = await completeOnboardingAction(INPUT)
    expect(res.ok).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('needs a signed-in member', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(completeOnboardingAction(INPUT)).rejects.toThrow('signed in')
  })
})

describe('#1090 — finishOnboardingAction', () => {
  it('marks the login onboarded, then goes where the flow ends', async () => {
    await expect(finishOnboardingAction('/open/tahoe')).rejects.toThrow('REDIRECT:/open/tahoe')
    expect(updateUser).toHaveBeenCalledWith({ data: { onboarded: true } })
  })

  it('never leaves the site', async () => {
    await expect(finishOnboardingAction('https://evil.example')).rejects.toThrow('REDIRECT:/')
  })
})
