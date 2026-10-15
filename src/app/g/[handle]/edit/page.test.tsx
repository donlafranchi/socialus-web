// #555 — the edit screen reads the viewer and the Page together, then ownership and the cards' data together, and a
// non-owner (or a signed-out visitor) still gets a 404.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  getUser: vi.fn(),
  resolvePageById: vi.fn(),
  viewerOwnsPage: vi.fn(),
  resolvePageContact: vi.fn(),
  resolvePageWhere: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: h.notFound }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from: () => ({ select: () => ({ eq: () => Object.assign(Promise.resolve({ data: [] }), { maybeSingle: () => Promise.resolve({ data: { metadata: {} } }) }) }) }),
  }),
}))
vi.mock('@/lib/groups/resolve-page-address', () => ({ resolvePageById: h.resolvePageById }))
vi.mock('@/lib/groups/resolve-shop', () => ({ viewerOwnsPage: h.viewerOwnsPage }))
vi.mock('@/lib/groups/page-contact', () => ({ resolvePageContact: h.resolvePageContact }))
vi.mock('@/lib/groups/page-where', () => ({ resolvePageWhere: h.resolvePageWhere }))
vi.mock('@/components/group/edit/EditCards', () => ({ EditCards: () => null }))
vi.mock('./actions', () => ({ editPageAction: vi.fn() }))
vi.mock('@/app/_actions/page-lifecycle-actions', () => ({ archivePageAction: vi.fn(), deletePageAction: vi.fn(), restorePageAction: vi.fn() }))

import EditPage from './page'

const SHOP = { groupId: 'g-1', publicId: 'abc123', kind: 'business', lifecycleState: 'active', displayName: 'Sourdough Co', publicDescription: '', photoUrl: null, pictureUrl: null, socialLinks: [], placements: [], purpose: null }
const params = Promise.resolve({ handle: 'abc123' })

beforeEach(() => {
  vi.clearAllMocks()
  h.getUser.mockResolvedValue({ data: { user: { id: 'm-1' } } })
  h.resolvePageById.mockResolvedValue(SHOP)
  h.viewerOwnsPage.mockResolvedValue(true)
  h.resolvePageContact.mockResolvedValue(null)
  h.resolvePageWhere.mockResolvedValue(null)
})

describe('/g/[handle]/edit (#555)', () => {
  it('signed out is a 404', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })
    await expect(EditPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('a Page that does not resolve is a 404', async () => {
    h.resolvePageById.mockResolvedValue(null)
    await expect(EditPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('a non-owner is a 404', async () => {
    h.viewerOwnsPage.mockResolvedValue(false)
    await expect(EditPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('an owner renders', async () => {
    const el = await EditPage({ params })
    expect(el).toBeTruthy()
  })
  it('reads the viewer and the Page together, then ownership and the card data together', async () => {
    // The first read of each round never settles until the other reads in its round have started.
    let releaseViewer!: (v: unknown) => void
    h.getUser.mockReturnValue(new Promise((r) => { releaseViewer = r }))
    const run = EditPage({ params })
    await Promise.resolve(); await Promise.resolve()
    expect(h.resolvePageById).toHaveBeenCalledTimes(1) // started while the viewer read is still pending
    releaseViewer({ data: { user: { id: 'm-1' } } })
    let releaseOwns!: (v: boolean) => void
    h.viewerOwnsPage.mockReturnValue(new Promise((r) => { releaseOwns = r }))
    for (let i = 0; i < 10 && h.viewerOwnsPage.mock.calls.length === 0; i++) await Promise.resolve()
    expect(h.resolvePageContact).toHaveBeenCalledTimes(1) // started while ownership is still pending
    expect(h.resolvePageWhere).toHaveBeenCalledTimes(1)
    releaseOwns(true)
    await run
  })
})
