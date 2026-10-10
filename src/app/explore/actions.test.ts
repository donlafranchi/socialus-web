// #329 — choosing a metro on the pill is remembered: on the device for anyone,
// on the member's own default-metro setting when signed in.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { loadBrowse, getUser, from, cookieSet, update, setDefault } = vi.hoisted(() => ({
  setDefault: vi.fn(),
  loadBrowse: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  cookieSet: vi.fn(),
  update: vi.fn(),
}))

const { searchNeighborhoods } = vi.hoisted(() => ({ searchNeighborhoods: vi.fn() }))
vi.mock('@/lib/places/neighborhood-search', () => ({ searchNeighborhoods }))
vi.mock('@/actions/_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({}) }))
vi.mock('./load', () => ({ loadBrowse, readSessionSeed: async () => 'seed' }))
vi.mock('@/actions', () => ({ memberDefaultMetroSet: setDefault }))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (o: unknown) => o }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser }, from })) }))

import { browseFeedAction, saveDefaultMetroAction, searchAreasAction } from './actions'

const METRO = { id: 'm-1', slug: 'portland-vancouver-or-wa' }

beforeEach(() => {
  vi.clearAllMocks()
  setDefault.mockResolvedValue({})
  loadBrowse.mockResolvedValue({ metro: METRO })
  update.mockReturnValue({ eq: async () => ({ error: null }) })
  from.mockReturnValue({ update })
})

describe('browseFeedAction remembers the choice', () => {
  it('sets the device cookie to the metro that resolved', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await browseFeedAction('portland-vancouver-or-wa')
    expect(cookieSet).toHaveBeenCalledWith('su_metro', 'portland-vancouver-or-wa', expect.objectContaining({ path: '/' }))
    expect(setDefault).not.toHaveBeenCalled()
  })

  it("signed in, also saves it as the member's default metro", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    await browseFeedAction('portland-vancouver-or-wa')
    expect(setDefault).toHaveBeenCalledWith({ actingMemberId: 'me' }, { metroId: 'm-1' })
  })

  it('remembers nothing when no slug was asked for, or the slug did not resolve to it', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await browseFeedAction(null)
    loadBrowse.mockResolvedValue({ metro: { id: 'x', slug: 'sacramento-roseville-ca' } })
    await browseFeedAction('atlantis-xx')
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('a failed save never costs the refetch', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    setDefault.mockRejectedValue(new Error('boom'))
    await expect(browseFeedAction('portland-vancouver-or-wa')).resolves.toEqual({ metro: METRO })
  })
})

describe('saveDefaultMetroAction', () => {
  const open = (found: boolean) =>
    from.mockImplementation((table: string) =>
      table === 'metro_polygons'
        ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found ? { id: 'm-1', slug: 'pdx' } : null }) }) }) }) }
        : { update },
    )

  it('saves an open metro for the member and the device', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    open(true)
    await expect(saveDefaultMetroAction('pdx')).resolves.toEqual({ ok: true })
    expect(setDefault).toHaveBeenCalledWith({ actingMemberId: 'me' }, { metroId: 'm-1' })
    expect(cookieSet).toHaveBeenCalledWith('su_metro', 'pdx', expect.anything())
  })

  it('refuses a metro that is not open', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    open(false)
    await expect(saveDefaultMetroAction('nope')).resolves.toEqual({ ok: false })
    expect(setDefault).not.toHaveBeenCalled()
  })

  it('signed out, nothing to save', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    open(true)
    await expect(saveDefaultMetroAction('pdx')).resolves.toEqual({ ok: false })
  })
})

describe('#476 — searchAreasAction', () => {
  it("searches the current metro's neighbourhoods", async () => {
    searchNeighborhoods.mockResolvedValue([{ placeId: 'p-1', name: 'Midtown', centroid: [0, 0] }])
    await expect(searchAreasAction('sacramento-roseville-ca', 'mid')).resolves.toEqual([{ id: 'p-1', name: 'Midtown' }])
    expect(searchNeighborhoods).toHaveBeenCalledWith(expect.anything(), 'mid', '40900')
  })

  it('has nothing for a metro whose boundaries are not loaded', async () => {
    searchNeighborhoods.mockClear()
    await expect(searchAreasAction('portland-vancouver-or-wa', 'mid')).resolves.toEqual([])
    expect(searchNeighborhoods).not.toHaveBeenCalled()
  })

  it('a failed search is an empty list, never a throw', async () => {
    searchNeighborhoods.mockRejectedValue(new Error('db'))
    await expect(searchAreasAction('sacramento-roseville-ca', 'mid')).resolves.toEqual([])
  })
})
