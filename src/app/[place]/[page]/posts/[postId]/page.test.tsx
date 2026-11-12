// #1139 — a post's id under a readable Page address (a share made before the page learned the post's slug) goes on
// to the post's own readable address; a post this reader may not see is not found.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolvePageByAddress, resolveSharedPost, notFound, permanentRedirect } = vi.hoisted(() => ({
  resolvePageByAddress: vi.fn(),
  resolveSharedPost: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  permanentRedirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`) }),
}))
vi.mock('next/navigation', () => ({ notFound, permanentRedirect }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageByAddress }))
vi.mock('@/lib/posts/resolve-shared-post', () => ({ resolveSharedPost }))
vi.mock('@/app/g/[handle]/page-body', () => ({ PageBody: () => null }))

import PostById from './page'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const params = Promise.resolve({ place: 'sacramento-ca', page: 'plant-foundry', postId: ID })
const SHOP = { publicId: '81bjk0', placeUrlSlug: 'sacramento-ca', pageUrlSlug: 'plant-foundry', groupId: 'g-1', displayName: 'Plant Foundry' }

beforeEach(() => vi.clearAllMocks())

describe('/[place]/[page]/posts/[postId]', () => {
  it('goes on to the post\'s readable address', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    resolveSharedPost.mockResolvedValue({ id: ID, urlSlug: 'fall-plant-sale' })
    await expect(PostById({ params })).rejects.toThrow('REDIRECT /sacramento-ca/plant-foundry/fall-plant-sale')
  })
  it('is not found when the Page or the post is not there for this reader', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    resolveSharedPost.mockResolvedValue(null)
    await expect(PostById({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    resolvePageByAddress.mockResolvedValue(null)
    await expect(PostById({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
