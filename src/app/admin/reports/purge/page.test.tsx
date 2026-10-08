// #491 — the purge page is the operator's alone, and a stranger gets 404.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, notFound, fetchPurgeCandidates } = vi.hoisted(() => ({
  getUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  fetchPurgeCandidates: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/actions/_lib/operator', () => ({ isOperator: (id: string | null) => id === 'op-1' }))
vi.mock('@/lib/admin/purge-queue', () => ({ fetchPurgeCandidates }))
vi.mock('../purge-actions', () => ({ purgePhotoAction: vi.fn() }))

import AdminPurgePage from './page'

beforeEach(() => vi.clearAllMocks())

describe('/admin/reports/purge', () => {
  it('is a 404 for anyone but the operator, and reads nothing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'someone' } } })
    await expect(AdminPurgePage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(fetchPurgeCandidates).not.toHaveBeenCalled()
  })

  it('a signed-out visitor gets the same 404', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(AdminPurgePage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows the operator the list', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'op-1' } } })
    const el = await AdminPurgePage()
    expect(el).toBeTruthy()
    expect(fetchPurgeCandidates).toHaveBeenCalled()
  })
})
