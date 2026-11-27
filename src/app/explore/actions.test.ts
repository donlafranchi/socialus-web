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

const { searchNeighborhoods, marketForZip, cookieDelete, cookieGet } = vi.hoisted(() => ({ searchNeighborhoods: vi.fn(), marketForZip: vi.fn(), cookieDelete: vi.fn(), cookieGet: vi.fn() }))
vi.mock('@/lib/signup/zip-market', () => ({ marketForZip }))
vi.mock('@/lib/places/neighborhood-search', () => ({ searchNeighborhoods }))
vi.mock('@/actions/_lib/db', () => ({ withTransaction: async (fn: (c: unknown) => unknown) => fn({}) }))
vi.mock('./load', () => ({ loadBrowse, readSessionSeed: async () => 'seed' }))
vi.mock('@/actions', () => ({ memberDefaultMetroSet: setDefault }))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (o: unknown) => o }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet, delete: cookieDelete, get: cookieGet }) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser }, from })) }))

import { browseFeedAction, searchAreasAction, setVisitorZipAction, forgetVisitorZipAction } from './actions'

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

describe('#476 — searchAreasAction', () => {
  it('searches the neighbourhoods, reading no MSA', async () => {
    searchNeighborhoods.mockResolvedValue([{ placeId: 'p-1', name: 'Midtown', centroid: [0, 0] }])
    await expect(searchAreasAction('mid')).resolves.toEqual([{ id: 'p-1', name: 'Midtown' }])
    expect(searchNeighborhoods).toHaveBeenCalledWith(expect.anything(), 'mid')
  })

  it('an empty query searches nothing', async () => {
    searchNeighborhoods.mockClear()
    await expect(searchAreasAction('  ')).resolves.toEqual([])
    expect(searchNeighborhoods).not.toHaveBeenCalled()
  })

  it('a failed search is an empty list, never a throw', async () => {
    searchNeighborhoods.mockRejectedValue(new Error('db'))
    await expect(searchAreasAction('mid')).resolves.toEqual([])
  })
})

// F081 (the PM, 2026-11-25) — a visitor's area "asked as a zip … stored, with an easy opt-out".
describe('setVisitorZipAction', () => {
  const metroRow = (slug: string | null) =>
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: slug ? { slug } : null }) }) }) })

  it('a zip in an open market: kept on this device, and Explore reads that market', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    marketForZip.mockResolvedValue({ key: 'sacramento', name: 'Sacramento', open: true, metroId: 'm-sac' })
    metroRow('sacramento-roseville-ca')
    loadBrowse.mockResolvedValue({ metro: { id: 'm-sac', slug: 'sacramento-roseville-ca' } })
    const r = await setVisitorZipAction('95816')
    expect(r.ok).toBe(true)
    expect(cookieSet).toHaveBeenCalledWith('su_zip', '95816|sacramento-roseville-ca', expect.objectContaining({ httpOnly: true, path: '/' }))
    expect(cookieSet).toHaveBeenCalledWith('su_metro', 'sacramento-roseville-ca', expect.objectContaining({ path: '/' }))
    expect(loadBrowse).toHaveBeenCalledWith('sacramento-roseville-ca', null, expect.anything())
  })

  it('a waiting market’s zip reads that market too (its waitlist)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    marketForZip.mockResolvedValue({ key: 'county-06101', name: 'Sutter County, CA', open: false, metroId: 'm-w' })
    metroRow('county-06101')
    await setVisitorZipAction('95991')
    expect(loadBrowse).toHaveBeenCalledWith('county-06101', null, expect.anything())
  })

  it('not five digits, an unknown zip, or a member: refused, and nothing is kept', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setVisitorZipAction('958')).toEqual({ ok: false, message: 'A zip is five numbers.' })
    expect(await setVisitorZipAction('9581a')).toMatchObject({ ok: false })
    marketForZip.mockResolvedValue(null)
    expect(await setVisitorZipAction('00000')).toEqual({ ok: false, message: "We don't recognize that zip, try again." })
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    marketForZip.mockResolvedValue({ key: 'sacramento', name: 'Sacramento', open: true, metroId: 'm-sac' })
    expect(await setVisitorZipAction('95816')).toEqual({ ok: false, message: 'Change your zip on You.' })
    expect(cookieSet).not.toHaveBeenCalled()
  })
})

describe('forgetVisitorZipAction — the opt-out', () => {
  const jar = (o: Record<string, string>) => cookieGet.mockImplementation((k: string) => (o[k] ? { value: o[k] } : undefined))

  it('forgets the zip and the market it set, then reads Explore afresh', async () => {
    jar({ su_zip: '95816|sacramento-roseville-ca', su_metro: 'sacramento-roseville-ca' })
    await forgetVisitorZipAction()
    expect(cookieDelete).toHaveBeenCalledWith({ name: 'su_zip', path: '/' })
    expect(cookieDelete).toHaveBeenCalledWith({ name: 'su_metro', path: '/' })
    expect(loadBrowse).toHaveBeenCalledWith(null, null, expect.anything())
  })

  it('an area the visitor picked since the zip is theirs, and stays', async () => {
    jar({ su_zip: '95816|sacramento-roseville-ca', su_metro: 'portland-vancouver-or-wa' })
    await forgetVisitorZipAction()
    expect(cookieDelete).toHaveBeenCalledWith({ name: 'su_zip', path: '/' })
    expect(cookieDelete).not.toHaveBeenCalledWith({ name: 'su_metro', path: '/' })
  })
})
