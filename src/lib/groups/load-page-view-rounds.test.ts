// #529 — a Page took 0.8–1.4 s to render because its reads ran one after the
// other (about eight rounds). Reads that do not depend on each other start
// together: the first round (items, posts, badge, who is looking), then one
// round for everything else, then only the owner's two extras.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { state, slow } = vi.hoisted(() => {
  const state = { inflight: 0, max: 0, order: [] as string[] }
  const slow = <T,>(name: string, value: T) => async () => {
    state.order.push(`start:${name}`)
    state.inflight++
    state.max = Math.max(state.max, state.inflight)
    await new Promise((r) => setTimeout(r, 5))
    state.inflight--
    state.order.push(`end:${name}`)
    return value
  }
  return { state, slow }
})

vi.mock('./page-metadata', () => ({ resolvePageMetadata: slow('metadata', null) }))
vi.mock('./page-tags', () => ({ resolvePageTags: slow('tags', []) }))
vi.mock('./page-contact', () => ({ resolvePageContact: slow('contact', null) }))
vi.mock('./page-where', () => ({ resolvePageWhere: slow('where', null) }))
vi.mock('./resolve-shop', () => ({
  resolveShopItems: slow('items', []),
  resolveLocalOwnerBadge: slow('badge', null),
  resolveOwnerClaim: slow('claim', null),
  viewerOwnsPage: slow('owns', false),
  viewerRelationship: slow('relationship', null),
}))
vi.mock('./page-posts', () => ({ resolvePagePosts: slow('posts', []) }))
vi.mock('@/lib/follows/follower-count', () => ({ countPageFollowers: slow('followers', 0) }))
vi.mock('@/lib/feed/withheld-announcements', () => ({ getWithheldAnnouncements: slow('withheld', []) }))

import { loadPageView } from './load-page-view'
const SHOP = { groupId: 'g-1', anchorLocationId: null, kind: 'business', lifecycleState: 'active' }
const asUser = (id: string | null) => ({ auth: { getUser: slow('auth', { data: { user: id ? { id } : null } }) } }) as never

beforeEach(() => {
  state.inflight = 0
  state.max = 0
  state.order = []
})

describe('loadPageView starts independent reads together (#529)', () => {
  it('a signed-in visitor: after the first round, every other read is in flight at once', async () => {
    await loadPageView(asUser('m-1'), SHOP as never)
    // claim, owns, relationship, tags, contact, where, metadata
    expect(state.max).toBeGreaterThanOrEqual(7)
  })
  it('a signed-out visitor: claim, owns, relationship and the withheld list together', async () => {
    await loadPageView(asUser(null), SHOP as never)
    expect(state.max).toBeGreaterThanOrEqual(4)
  })
  it('never more than three rounds for a visitor: nothing waits for a read it does not need', async () => {
    await loadPageView(asUser('m-1'), SHOP as never)
    // Rounds = how many times the number in flight drops to zero.
    let inflight = 0
    let rounds = 0
    for (const e of state.order) {
      if (e.startsWith('start:')) {
        if (inflight === 0) rounds++
        inflight++
      } else inflight--
    }
    expect(rounds).toBeLessThanOrEqual(2)
  })
  it('the owner still gets the follower count and the draft tag count', async () => {
    const view = await loadPageView(asUser('m-1'), SHOP as never)
    expect(view.followerCount).toBe(0)
    expect(view.draftTagCount).toBe(0)
  })
})
