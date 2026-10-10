// #537 — a missing or draft Page answers 404 before anything streams, and an
// existing one answers with its outline at once while the rest is read.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'

const { resolvePageById, loadPageView, notFound } = vi.hoisted(() => ({
  resolvePageById: vi.fn(),
  loadPageView: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageById }))
vi.mock('@/lib/groups/load-page-view', () => ({ loadPageView }))
vi.mock('@/components/group/ShopPublicPage', () => ({ ShopPublicPage: () => null }))
vi.mock('@/lib/groups/share-metadata', () => ({ shareMetadata: () => ({}) }))

import PageAtCanonicalAddress from './page'

beforeEach(() => vi.clearAllMocks())

describe('/g/[handle] (#537)', () => {
  it('a Page that does not resolve is not found before any read of the Page itself', async () => {
    resolvePageById.mockResolvedValue(null)
    await expect(PageAtCanonicalAddress({ params: Promise.resolve({ handle: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(loadPageView).not.toHaveBeenCalled()
  })
  it('an existing Page returns at once with an outline, without waiting for the rest of its reads', async () => {
    resolvePageById.mockResolvedValue({ publicId: 'abc123', groupId: 'g-1' })
    loadPageView.mockReturnValue(new Promise(() => {})) // never settles
    const el = await PageAtCanonicalAddress({ params: Promise.resolve({ handle: 'abc123' }) })
    expect(el.type).toBe(Suspense)
    expect((el.props as { fallback: { type: { name: string } } }).fallback.type.name).toBe('PageSkeleton')
  })
})
