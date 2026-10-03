// Two regressions guarded here:
//   1. A signup whose `members` row was never created (auth-signup webhook not
//      configured — migration 006 raises a WARNING and returns) must fail loudly
//      at the name step, not silently succeed.
//   2. #205 — completing onboarding writes no place for anyone (F081
//      criterion 7). It marks the login onboarded, and nothing else.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, updateUser, updateChain, placeInterestAdd } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  updateChain: vi.fn(),
  placeInterestAdd: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser, updateUser },
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

beforeEach(() => {
  getUser.mockReset()
  updateChain.mockReset()
  placeInterestAdd.mockReset()
  updateUser.mockReset()
  updateUser.mockResolvedValue({ data: {}, error: null })
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
  // [guards F081.7]
  it('writes no home place for anyone — not the Good Place, not any place', async () => {
    updateChain.mockResolvedValue({ data: [{ id: MEMBER }], error: null })
    const res = await completeOnboardingAction(INPUT)
    expect(res).toEqual({ ok: true })
    expect(placeInterestAdd).not.toHaveBeenCalled()
  })

  it('marks the login onboarded once the name lands', async () => {
    updateChain.mockResolvedValue({ data: [{ id: MEMBER }], error: null })
    await completeOnboardingAction(INPUT)
    expect(updateUser).toHaveBeenCalledWith({ data: { onboarded: true } })
  })

  it('marks nothing when the profile write fails', async () => {
    updateChain.mockResolvedValue({ data: [], error: null })
    const res = await completeOnboardingAction(INPUT)
    expect(res.ok).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
    expect(placeInterestAdd).not.toHaveBeenCalled()
  })
})
