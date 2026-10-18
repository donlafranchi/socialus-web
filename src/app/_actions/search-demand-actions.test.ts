// #909 — the server side of search demand: a settled Explore search, and the switch on You.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, demandLog, sharingSet, cookieGet, headerGet } = vi.hoisted(() => ({
  getUser: vi.fn(),
  demandLog: vi.fn(),
  sharingSet: vi.fn(),
  cookieGet: vi.fn(),
  headerGet: vi.fn(),
}))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }), headers: async () => ({ get: headerGet }) }))
vi.mock('@/actions', async (importActual) => ({
  ...(await importActual<typeof import('@/actions')>()),
  searchDemandLog: demandLog,
  memberSearchSharingSet: sharingSet,
}))

import { logSearchAction, setSearchSharingAction } from './search-demand-actions'

const PLACE = '33333333-3333-3333-3333-333333333333'
beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  demandLog.mockResolvedValue({ logged: true })
  cookieGet.mockReturnValue(undefined)
  headerGet.mockReturnValue(null)
})

describe('logSearchAction', () => {
  it('passes the search on with the member as the acting member, and the member as the dedupe searcher', async () => {
    await logSearchAction('tacos', 'sacramento', PLACE, 3)
    const [ctx, input] = demandLog.mock.calls[0]
    expect(ctx.actingMemberId).toBe('u1')
    expect(input).toEqual({ query: 'tacos', metroSlug: 'sacramento', placeId: PLACE, resultCount: 3, searcher: 'u1' })
  })

  it('signed out, it logs with no member, keyed on this browser', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    cookieGet.mockImplementation((n: string) => (n === 'su_seed' ? { value: 'seed-abc' } : undefined))
    await logSearchAction('tacos', null, null, 0)
    const [ctx, input] = demandLog.mock.calls[0]
    expect(() => ctx.actingMemberId).toThrow()
    expect(input.searcher).toBe('seed:seed-abc')
  })

  it('signed out with no cookie, it falls back to the address and browser', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    headerGet.mockImplementation((n: string) => (n === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : n === 'user-agent' ? 'UA' : null))
    await logSearchAction('tacos', null, null, 0)
    expect(demandLog.mock.calls[0][1].searcher).toBe('ip:1.2.3.4|UA')
  })

  it('skips anything under 2 characters without a round trip', async () => {
    await logSearchAction(' a ', 'sacramento', null, 0)
    expect(demandLog).not.toHaveBeenCalled()
  })

  it('never throws to the browser: a failed log is silent', async () => {
    demandLog.mockRejectedValue(new Error('db down'))
    await expect(logSearchAction('tacos', 'sacramento', null, 1)).resolves.toBeUndefined()
  })
})

describe('setSearchSharingAction', () => {
  it('sets the signed-in member\'s own switch', async () => {
    sharingSet.mockResolvedValue({ on: false })
    expect(await setSearchSharingAction(false)).toEqual({ ok: true, on: false })
    expect(sharingSet).toHaveBeenCalledWith(expect.objectContaining({ actingMemberId: 'u1' }), { on: false })
  })

  it('needs a signed-in member', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await setSearchSharingAction(false)).toEqual({ ok: false })
    expect(sharingSet).not.toHaveBeenCalled()
  })

  it('a failure comes back as data', async () => {
    sharingSet.mockRejectedValue(new Error('x'))
    expect(await setSearchSharingAction(true)).toEqual({ ok: false })
  })
})
