// Guarded here:
//   1. A signup whose `members` row was never created (auth-signup webhook not
//      configured — migration 006 raises a WARNING and returns) must fail loudly
//      at the profile step, not silently succeed.
//   2. #205 / F081 criterion 7 — onboarding writes no place for anyone; a member's
//      home is the metro their zip decided, or nothing.
//   3. #222 — four fields and the 18+ box; the zip decides the metro.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, updateUser, signupProfileSet, placeInterestAdd, metroForZip } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signupProfileSet: vi.fn(),
  placeInterestAdd: vi.fn(),
  metroForZip: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser, updateUser } })),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: vi.fn((o: unknown) => o) }))
vi.mock('@/lib/signup/zip-metro', () => ({ metroForZip }))
vi.mock('@/actions', () => ({
  memberSignupProfileSet: signupProfileSet,
  memberPlaceInterestAdd: placeInterestAdd,
  memberInterestsAdd: vi.fn(),
  ActionError: class ActionError extends Error {},
}))
vi.mock('@/actions/_lib/errors', () => ({ NotFoundError: class NotFoundError extends Error {} }))

import { completeOnboardingAction } from './actions'
import { NotFoundError } from '@/actions/_lib/errors'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const SAC = { id: '22222222-2222-2222-2222-222222222222', name: 'Sacramento-Roseville, CA' }
const INPUT = { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true }

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockResolvedValue({ data: {}, error: null })
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
  signupProfileSet.mockResolvedValue({ memberId: MEMBER, metroId: SAC.id })
  metroForZip.mockResolvedValue(SAC)
})

describe('completeOnboardingAction', () => {
  it('saves the four fields and the metro the zip decided, and says which metro', async () => {
    const res = await completeOnboardingAction(INPUT)
    expect(res).toEqual({ ok: true, metro: { name: SAC.name } })
    expect(metroForZip).toHaveBeenCalledWith(expect.anything(), '95819')
    expect(signupProfileSet).toHaveBeenCalledWith(
      { actingMemberId: MEMBER },
      { legalName: 'Maya Rivera', displayName: 'Maya', zip: '95819', adultConfirmed: true, metroId: SAC.id },
    )
  })

  it('a zip with no metro is saved with none: nothing is guessed', async () => {
    metroForZip.mockResolvedValue(null)
    const res = await completeOnboardingAction({ ...INPUT, zip: '10001' })
    expect(res).toEqual({ ok: true, metro: null })
    expect(signupProfileSet.mock.calls[0]![1].metroId).toBeNull()
  })

  // [guards F081.7]
  it('writes no home place for anyone', async () => {
    await completeOnboardingAction(INPUT)
    expect(placeInterestAdd).not.toHaveBeenCalled()
  })

  it('marks the login onboarded once the profile lands', async () => {
    await completeOnboardingAction(INPUT)
    expect(updateUser).toHaveBeenCalledWith({ data: { onboarded: true } })
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
