// #806 — a save hands back the claim and the badge as they now stand, so the
// Page shows them without a router refresh (one could be dropped by the router
// and leave the Page showing the claim as it was before the save).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  set: vi.fn(),
  remove: vi.fn(),
  resolveOwnerClaim: vi.fn(),
  resolveLocalOwnerBadge: vi.fn(),
  anchor: { anchor_location_id: 'loc-1' } as { anchor_location_id: string | null } | null,
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'm-1' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.anchor, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (x: unknown) => x }))
vi.mock('@/actions', () => ({ memberBusinessJurisdictionSet: h.set, memberBusinessJurisdictionRemove: h.remove, ActionError: class extends Error {} }))
vi.mock('@/lib/groups/resolve-shop', () => ({ resolveOwnerClaim: h.resolveOwnerClaim, resolveLocalOwnerBadge: h.resolveLocalOwnerBadge }))

import { setJurisdictionAction, removeJurisdictionAction } from './claim-actions'

beforeEach(() => {
  vi.clearAllMocks()
  h.resolveOwnerClaim.mockResolvedValue({ zip: '95817', isProximal: true })
  h.resolveLocalOwnerBadge.mockResolvedValue({ label: 'Claimed local owner' })
})

describe('claim actions return the Page claim state after the save', () => {
  it('setting a ZIP returns the new claim and badge, read after the write', async () => {
    const order: string[] = []
    h.set.mockImplementation(async () => { order.push('write') })
    h.resolveOwnerClaim.mockImplementation(async () => { order.push('read'); return { zip: '95817', isProximal: true } })
    const out = await setJurisdictionAction({ groupId: 'g-1', zip: '95817' })
    expect(out).toEqual({ claim: { zip: '95817', isProximal: true }, badge: { label: 'Claimed local owner' } })
    expect(order).toEqual(['write', 'read'])
    expect(h.resolveOwnerClaim).toHaveBeenCalledWith(expect.anything(), { groupId: 'g-1', anchorLocationId: 'loc-1', viewerMemberId: 'm-1' })
  })
  it('removing returns the empty claim and no badge', async () => {
    h.resolveOwnerClaim.mockResolvedValue({ zip: null, isProximal: false })
    h.resolveLocalOwnerBadge.mockResolvedValue(null)
    expect(await removeJurisdictionAction({ groupId: 'g-1' })).toEqual({ claim: { zip: null, isProximal: false }, badge: null })
  })
  it('a failed save reads nothing and throws', async () => {
    h.set.mockRejectedValueOnce(new Error('nope'))
    await expect(setJurisdictionAction({ groupId: 'g-1', zip: '95817' })).rejects.toThrow()
    expect(h.resolveOwnerClaim).not.toHaveBeenCalled()
  })
})
