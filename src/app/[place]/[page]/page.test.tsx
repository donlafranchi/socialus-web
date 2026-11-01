// #1139 (Don, 2026-11-01) — a Page at its readable address: /<place>-<st>/<page-slug>. Unknown place or Page is a 404
// decided before anything streams; the preview names this address.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'

const { resolvePageByAddress, notFound } = vi.hoisted(() => ({
  resolvePageByAddress: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageByAddress }))
vi.mock('@/app/g/[handle]/page-body', () => ({ PageBody: () => null }))

import PageAtItsAddress, { generateMetadata } from './page'

const params = Promise.resolve({ place: 'sacramento-ca', page: 'plant-foundry' })
const SHOP = { publicId: '81bjk0', placeUrlSlug: 'sacramento-ca', pageUrlSlug: 'plant-foundry', groupId: 'g-1', displayName: 'Plant Foundry', publicDescription: 'A nursery.', slug: 's', lifecycleState: 'active', photoUrl: null, photoHiddenAt: null, photoRemovedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.socialus.org'
})

describe('/[place]/[page]', () => {
  it('is not found when no Page has that address', async () => {
    resolvePageByAddress.mockResolvedValue(null)
    await expect(PageAtItsAddress({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(resolvePageByAddress).toHaveBeenCalledWith(expect.anything(), 'sacramento-ca', 'plant-foundry')
  })

  it('shows the Page, its outline at once', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    const el = await PageAtItsAddress({ params })
    expect(el.type).toBe(Suspense)
    expect((el.props as { children: { props: Record<string, unknown> } }).children.props).toMatchObject({ shop: SHOP })
  })

  it('previews with this address as canonical and og:url', async () => {
    resolvePageByAddress.mockResolvedValue(SHOP)
    const m = await generateMetadata({ params })
    expect(m.alternates?.canonical).toBe('https://www.socialus.org/sacramento-ca/plant-foundry')
    expect(m.openGraph).toMatchObject({ url: 'https://www.socialus.org/sacramento-ca/plant-foundry', title: 'Plant Foundry' })
  })
})
