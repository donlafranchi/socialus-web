// F102 criterion 13 — posts and uploads record where they came from, and a
// failure to record never takes the post or the upload down with it.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, record, postCreate, ip } = vi.hoisted(() => ({
  getUser: vi.fn(),
  record: vi.fn(),
  postCreate: vi.fn(),
  ip: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/lib/request-ip', () => ({ requestIp: ip }))
vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, originRecord: record, groupPostCreate: postCreate }
})

import { recordUploadAction } from './origin-actions'
import { postToPageAction } from './page-post-actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  getUser.mockReset()
  record.mockReset()
  postCreate.mockReset()
  ip.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
  ip.mockResolvedValue('203.0.113.7')
  record.mockResolvedValue(undefined)
})

describe('recordUploadAction', () => {
  it('records the upload with the address of the request', async () => {
    await recordUploadAction({ url: 'https://x.test/m/a.webp' })
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ actingMemberId: MEMBER }), { kind: 'upload', ref: 'https://x.test/m/a.webp', ip: '203.0.113.7' })
  })

  it('never throws: a failed record does not undo an upload', async () => {
    record.mockRejectedValue(new Error('db down'))
    await expect(recordUploadAction({ url: 'u' })).resolves.toBeUndefined()
  })

  it('signed out records nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await recordUploadAction({ url: 'u' })
    expect(record).not.toHaveBeenCalled()
  })
})

describe('postToPageAction', () => {
  it('records the post\'s origin once it is stored', async () => {
    postCreate.mockResolvedValue({ postId: 'p1', createdAt: '2026-10-07T12:00:00Z' })
    const r = await postToPageAction({ groupId: 'g1', body: 'Hello' })
    expect(r.ok).toBe(true)
    expect(record).toHaveBeenCalledWith(expect.anything(), { kind: 'post', ref: 'p1', ip: '203.0.113.7' })
  })

  it('a post that failed records nothing', async () => {
    postCreate.mockRejectedValue(new Error('no'))
    await postToPageAction({ groupId: 'g1', body: 'Hello' })
    expect(record).not.toHaveBeenCalled()
  })

  it('a failed record does not fail the post', async () => {
    postCreate.mockResolvedValue({ postId: 'p1', createdAt: 't' })
    record.mockRejectedValue(new Error('db down'))
    expect((await postToPageAction({ groupId: 'g1', body: 'Hello' })).ok).toBe(true)
  })
})
