import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, notFound, query } = vi.hoisted(() => ({
  getUser: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  query: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => ({ query }) }))
vi.mock('@/actions/_lib/operator', () => ({ isOperator: (id: string | null) => id === 'owner-1' }))

import { requirePagePermission, staffPermissions } from './page-guard'

beforeEach(() => vi.clearAllMocks())

describe('requirePagePermission (#544)', () => {
  it('404s a signed-out visitor, and a member with no role, with the same error', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(requirePagePermission('metrics.view')).rejects.toThrow('NEXT_NOT_FOUND')
    getUser.mockResolvedValue({ data: { user: { id: 'm1' } } })
    query.mockResolvedValue({ rows: [] })
    await expect(requirePagePermission('metrics.view')).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('404s a member whose role holds other permissions but not this one', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm2' } } })
    query.mockResolvedValue({ rows: [{ permission: 'reports.review' }] })
    await expect(requirePagePermission('metrics.view')).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(requirePagePermission('reports.review')).resolves.toBe('m2')
  })
  it('lets the owner through everywhere, with no role row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } })
    for (const p of ['metrics.view', 'tags.review', 'builders.manage'] as const) await expect(requirePagePermission(p)).resolves.toBe('owner-1')
    expect(query).not.toHaveBeenCalled()
  })
  it('a database failure is a 404, not an open door', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'm3' } } })
    query.mockRejectedValue(new Error('down'))
    await expect(requirePagePermission('metrics.view')).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await staffPermissions()).permissions).toEqual([])
  })
})
