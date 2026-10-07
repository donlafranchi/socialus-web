// #491 — the server action: the operator's own session deletes the object, the
// deletion is VERIFIED, and only then is it recorded.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, remove, purgeTarget, purge, revalidatePath, fetchMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  remove: vi.fn(),
  purgeTarget: vi.fn(),
  purge: vi.fn(),
  revalidatePath: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    storage: { from: () => ({ remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/media/${p}` } }) }) },
  })),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (o: unknown) => o }))
vi.mock('@/actions', () => ({ reportPurgeTarget: purgeTarget, reportPurge: purge, ActionError: class extends Error {} }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.stubGlobal('fetch', fetchMock)

import { purgePhotoAction } from './purge-actions'

const GROUP = '33333333-3333-3333-3333-333333333333'
const input = { groupId: GROUP, reasonCode: 'illegal_content' as const }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'op-1' } }, error: null })
  purgeTarget.mockResolvedValue({ groupId: GROUP, objectPath: 'm1/a.webp' })
  purge.mockResolvedValue({ purgeId: 'p1', groupId: GROUP })
  remove.mockResolvedValue({ data: [{ name: 'm1/a.webp' }], error: null })
  fetchMock.mockResolvedValue({ status: 404 })
})

describe('purgePhotoAction', () => {
  it('names the object, deletes it as the operator, checks it is gone, then records it', async () => {
    await purgePhotoAction(input)
    expect(remove).toHaveBeenCalledWith(['m1/a.webp'])
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('m1/a.webp'), expect.objectContaining({ method: 'HEAD' }))
    expect(purge).toHaveBeenCalledWith({ actingMemberId: 'op-1' }, { ...input, objectPath: 'm1/a.webp' })
    expect(purgeTarget.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!)
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(purge.mock.invocationCallOrder[0]!)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/reports')
  })

  it('records nothing when the storage call fails', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(purgePhotoAction(input)).rejects.toThrow(/delete/i)
    expect(purge).not.toHaveBeenCalled()
  })

  it('records nothing when the object is still fetchable afterwards (a silent policy refusal)', async () => {
    remove.mockResolvedValue({ data: [], error: null })
    fetchMock.mockResolvedValue({ status: 200 })
    await expect(purgePhotoAction(input)).rejects.toThrow(/still there/i)
    expect(purge).not.toHaveBeenCalled()
  })

  it('an object that was already gone is fine: the purge can be run again', async () => {
    remove.mockResolvedValue({ data: [], error: null })
    fetchMock.mockResolvedValue({ status: 404 })
    await purgePhotoAction(input)
    expect(purge).toHaveBeenCalledTimes(1)
  })

  it('needs a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(purgePhotoAction(input)).rejects.toThrow(/not permitted/i)
    expect(remove).not.toHaveBeenCalled()
  })
})
