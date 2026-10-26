// #537 — a missing or draft Page answers 404 before anything streams, and an
// existing one answers with its outline at once while the rest is read.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'

const { resolvePageById, loadPageView, notFound, loadPageSearchDemand, getClaims, loadViewerReminders } = vi.hoisted(() => ({
  getClaims: vi.fn(async () => ({ data: null, error: null })),
  loadViewerReminders: vi.fn(async () => ({ byPost: {}, bySeries: {}, byStall: {}, byShows: {} })),
  loadPageSearchDemand: vi.fn(async () => null),
  resolvePageById: vi.fn(),
  loadPageView: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getClaims } }) }))
vi.mock('@/lib/reminders/viewer-reminders', async (orig) => ({ ...(await orig<typeof import('@/lib/reminders/viewer-reminders')>()), loadViewerReminders }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageById }))
vi.mock('@/lib/groups/load-page-view', () => ({ loadPageView }))
vi.mock('@/components/group/ShopPublicPage', () => ({ ShopPublicPage: () => null }))
vi.mock('@/lib/search/page-demand', () => ({ loadPageSearchDemand }))
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

  // #909 — the search-demand card is read only for the Page's owner.
  it('reads what locals searched only when the viewer owns the Page', async () => {
    const shop = { publicId: 'abc123', groupId: 'g-1' }
    resolvePageById.mockResolvedValue(shop)
    const body = async (owns: boolean) => {
      loadPageView.mockResolvedValue({ viewerOwnsPage: owns })
      const el = await PageAtCanonicalAddress({ params: Promise.resolve({ handle: 'abc123' }) })
      const inner = (el.props as { children: { type: (p: unknown) => Promise<unknown>; props: unknown } }).children
      await inner.type(inner.props)
    }
    await body(false)
    expect(loadPageSearchDemand).not.toHaveBeenCalled()
    await body(true)
    expect(loadPageSearchDemand).toHaveBeenCalledWith(expect.anything(), 'g-1')
  })

  // #978 — a signed-in viewer's reminders are read alongside the Page's reads, not after them.
  it('asks for a signed-in viewer\'s reminders while the Page view is still outstanding', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'm-1' } } as never, error: null } as never)
    resolvePageById.mockResolvedValue({ publicId: 'abc123', groupId: 'g-1' })
    loadPageView.mockReturnValue(new Promise(() => {})) // the view never settles
    const el = await PageAtCanonicalAddress({ params: Promise.resolve({ handle: 'abc123' }) })
    const inner = (el.props as { children: { type: (p: unknown) => Promise<unknown>; props: unknown } }).children
    void inner.type(inner.props)
    await new Promise((r) => setTimeout(r, 10))
    expect(loadViewerReminders).toHaveBeenCalledTimes(1)
    expect(loadPageView).toHaveBeenCalledTimes(1)
  })
})
