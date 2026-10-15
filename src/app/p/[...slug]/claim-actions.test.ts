// #791 — a saved claim brings the Page back with it. The widget's own refresh
// raced the save on a fast server and the Page kept showing no claim.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { revalidatePath, set, remove } = vi.hoisted(() => ({ revalidatePath: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'm-1' } }, error: null }) } }),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (x: unknown) => x }))
vi.mock('@/actions', () => ({ memberBusinessJurisdictionSet: set, memberBusinessJurisdictionRemove: remove, ActionError: class extends Error {} }))

import { setJurisdictionAction, removeJurisdictionAction } from './claim-actions'

beforeEach(() => vi.clearAllMocks())

describe('claim actions revalidate the Page', () => {
  it('after setting a ZIP', async () => {
    await setJurisdictionAction({ groupId: 'g-1', zip: '95817' })
    expect(set).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/g/[handle]', 'page')
  })
  it('after removing it', async () => {
    await removeJurisdictionAction({ groupId: 'g-1' })
    expect(revalidatePath).toHaveBeenCalledWith('/g/[handle]', 'page')
  })
  it('not when the save fails', async () => {
    set.mockRejectedValueOnce(new Error('nope'))
    await expect(setJurisdictionAction({ groupId: 'g-1', zip: '95817' })).rejects.toThrow()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
