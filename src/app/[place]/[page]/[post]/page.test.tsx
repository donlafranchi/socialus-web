// #1139 (Don, 2026-11-01) — a post at its readable address: /<place>-<st>/<page-slug>/<post-slug>. The Page landed on
// the post, to whoever could already read it there; anyone else gets not found.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'

const { resolvePageByAddress, resolvePostIdBySlug, resolveSharedPost, notFound } = vi.hoisted(() => ({
  resolvePageByAddress: vi.fn(),
  resolvePostIdBySlug: vi.fn(),
  resolveSharedPost: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageByAddress }))
vi.mock('@/lib/posts/resolve-shared-post', () => ({ resolvePostIdBySlug, resolveSharedPost }))
vi.mock('@/app/g/[handle]/page-body', () => ({ PageBody: () => null }))

import PostAtItsAddress, { generateMetadata } from './page'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const params = Promise.resolve({ place: 'sacramento-ca', page: 'plant-foundry', post: 'fall-plant-sale' })
const SHOP = { publicId: '81bjk0', placeUrlSlug: 'sacramento-ca', pageUrlSlug: 'plant-foundry', groupId: 'g-1', displayName: 'Plant Foundry', publicDescription: '', slug: 's', lifecycleState: 'active', photoUrl: null, photoHiddenAt: null, photoRemovedAt: null, pictureUrl: null }
const POST = { id: ID, urlSlug: 'fall-plant-sale', kind: 'news', headline: 'Fall plant sale', body: 'Half off perennials.', startsAt: null, createdAt: '2026-10-30T12:00:00Z', locationLabel: null, photoUrl: null }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
})

describe('/[place]/[page]/[post]', () => {
  it('is not found when the Page is not, or no post this reader may see has that slug', async () => {
    resolvePageByAddress.mockResolvedValue(null)
    await expect(PostAtItsAddress({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    resolvePageByAddress.mockResolvedValue(SHOP)
    resolvePostIdBySlug.mockResolvedValue(null)
    await expect(PostAtItsAddress({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(resolveSharedPost).not.toHaveBeenCalled()
  })

  it('shows the Page landed on the post', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    resolvePostIdBySlug.mockResolvedValue(ID)
    resolveSharedPost.mockResolvedValue(POST)
    const el = await PostAtItsAddress({ params })
    expect(el.type).toBe(Suspense)
    expect((el.props as { children: { props: Record<string, unknown> } }).children.props).toMatchObject({ focusPostId: ID, shop: SHOP })
    expect(resolvePostIdBySlug).toHaveBeenCalledWith(expect.anything(), SHOP, 'fall-plant-sale')
  })

  it('previews with this address, signed in or out', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    resolvePostIdBySlug.mockResolvedValue(ID)
    resolveSharedPost.mockResolvedValue(POST)
    const m = await generateMetadata({ params })
    expect(m.alternates?.canonical).toBe('https://www.socialus.org/sacramento-ca/plant-foundry/fall-plant-sale')
    expect(m.openGraph).toMatchObject({ title: 'Fall plant sale', url: 'https://www.socialus.org/sacramento-ca/plant-foundry/fall-plant-sale' })
  })
})
