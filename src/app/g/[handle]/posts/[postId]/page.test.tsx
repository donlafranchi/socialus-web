// Don, 2026-10-31: "I can't share an anouncment?" — a post's own address shows its Page, landed on the post, to whoever
// could already read it there; anyone else gets not found, and its preview never carries words it may not show.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'

const { resolvePageById, resolveSharedPost, notFound } = vi.hoisted(() => ({
  resolvePageById: vi.fn(),
  resolveSharedPost: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageById }))
vi.mock('@/lib/posts/resolve-shared-post', () => ({ resolveSharedPost }))
vi.mock('../../page-body', () => ({ PageBody: () => null }))

import PostAtItsAddress, { generateMetadata } from './page'

const ID = '0b6c1e9a-4a3f-4f7e-9d6b-2c1a5e8f7d10'
const params = Promise.resolve({ handle: '7k3x8m', postId: ID })
const SHOP = { publicId: '7k3x8m', groupId: 'g-1', displayName: 'Oak Park Sourdough', publicDescription: '', slug: 's', lifecycleState: 'active', photoUrl: null, photoHiddenAt: null, photoRemovedAt: null, pictureUrl: null }
const POST = { id: ID, kind: 'news', headline: 'Bread is back', body: 'Rye on Saturday.', startsAt: null, createdAt: '2026-10-30T12:00:00Z', locationLabel: 'Oak Park', photoUrl: null }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
})

describe('/g/[handle]/posts/[postId]', () => {
  it('is not found when the Page is not, or the post is not one this reader may see', async () => {
    resolvePageById.mockResolvedValue(null)
    await expect(PostAtItsAddress({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(resolveSharedPost).not.toHaveBeenCalled()
    resolvePageById.mockResolvedValue(SHOP)
    resolveSharedPost.mockResolvedValue(null)
    await expect(PostAtItsAddress({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(JSON.stringify(await generateMetadata({ params }))).not.toMatch(/Bread|Rye|Oak Park/)
  })

  it('shows the Page landed on the post', async () => {
    resolvePageById.mockResolvedValue(SHOP)
    resolveSharedPost.mockResolvedValue(POST)
    const el = await PostAtItsAddress({ params })
    expect(el.type).toBe(Suspense)
    const props = (el.props as { children: { props: Record<string, unknown> } }).children.props
    expect(props).toMatchObject({ focusPostId: ID, shop: SHOP })
    expect(props.preview ?? null).toBeNull()
  })

  // F134 — one read for every reader: the preview is the post's headline and lead line, signed in or out.
  it('previews with the headline and lead line', async () => {
    resolvePageById.mockResolvedValue(SHOP)
    resolveSharedPost.mockResolvedValue(POST)
    expect((await generateMetadata({ params })).openGraph).toMatchObject({
      title: 'Bread is back',
      description: expect.stringMatching(/^Update/),
      url: `https://www.socialus.org/g/7k3x8m/posts/${ID}`,
    })
  })
})
