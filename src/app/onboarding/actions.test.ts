// Two regressions guarded here:
//   1. A signup whose `members` row was never created (auth-signup webhook not
//      configured — migration 006 raises a WARNING and returns) must fail loudly
//      at the name step, not silently succeed and then blow up on the FK
//      violation at the locality write.
//   2. Completing onboarding defaults the Member's primary_home to The Good
//      Place — server-side, with no picker.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, updateChain, placeInterestAdd } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateChain: vi.fn(),
  placeInterestAdd: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({ update: () => ({ eq: () => ({ select: () => updateChain() }) }) }),
  })),
}))

vi.mock('@/lib/action-context', () => ({
  resolveActionContext: vi.fn((o: unknown) => o),
}))

vi.mock('@/actions', () => ({
  memberPlaceInterestAdd: placeInterestAdd,
  memberInterestsAdd: vi.fn(),
  ActionError: class ActionError extends Error {},
}))

import { saveProfileAction, completeOnboardingAction } from './actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const GOOD_PLACE = '10000000-0000-4000-8000-000000000003'

beforeEach(() => {
  getUser.mockReset()
  updateChain.mockReset()
  placeInterestAdd.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
  placeInterestAdd.mockResolvedValue({})
})

const INPUT = { displayName: 'Eleanor Shellstrop' }

describe('saveProfileAction — missing members row', () => {
  it('reports failure when the update matches zero rows', async () => {
    // supabase-js returns no error for an UPDATE that matches nothing.
    updateChain.mockResolvedValue({ data: [], error: null })
    const res = await saveProfileAction(INPUT)
    expect(res.ok).toBe(false)
  })

  it('succeeds when the members row exists', async () => {
    updateChain.mockResolvedValue({ data: [{ id: MEMBER }], error: null })
    const res = await saveProfileAction(INPUT)
    expect(res).toEqual({ ok: true })
  })

  it('rejects an empty name without touching the DB', async () => {
    const res = await saveProfileAction({ displayName: '   ' })
    expect(res.ok).toBe(false)
    expect(updateChain).not.toHaveBeenCalled()
  })
})

describe('completeOnboardingAction', () => {
  it('defaults primary_home to The Good Place after the name lands', async () => {
    updateChain.mockResolvedValue({ data: [{ id: MEMBER }], error: null })
    const res = await completeOnboardingAction(INPUT)
    expect(res).toEqual({ ok: true })
    expect(placeInterestAdd).toHaveBeenCalledWith(expect.anything(), {
      placeId: GOOD_PLACE,
      scopeKind: 'primary_home',
    })
  })

  it('does not set a home locality when the profile write fails', async () => {
    updateChain.mockResolvedValue({ data: [], error: null })
    const res = await completeOnboardingAction(INPUT)
    expect(res.ok).toBe(false)
    expect(placeInterestAdd).not.toHaveBeenCalled()
  })
})
