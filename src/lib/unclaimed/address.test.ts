// #936 — an unclaimed Page with a street address sits at that address, not its town.
import { describe, it, expect, vi } from 'vitest'
import { streetAddressOf, pinUnclaimed } from './address'

describe('streetAddressOf', () => {
  it('reads the street address a maker row names in its own words', () => {
    expect(streetAddressOf({ city: 'Sutter Creek', text: 'A micro-winery making minimal-intervention wines from certified organic estate grapes at 15010 Ridge Road' })).toBe(
      '15010 Ridge Road, Sutter Creek, CA',
    )
    expect(streetAddressOf({ city: 'Lodi', text: 'A museum at 114 N. Main St in downtown Lodi' })).toBe('114 N. Main St, Lodi, CA')
  })
  it('takes a listed address as it is', () => {
    expect(streetAddressOf({ city: 'Davis', address: '620 G St, Davis, CA 95616', text: 'A grocery' })).toBe('620 G St, Davis, CA 95616')
  })
  it('no street address, nothing: never a guess', () => {
    expect(streetAddressOf({ city: 'Sacramento', text: 'A bakery in Midtown since 1999' })).toBeNull()
    expect(streetAddressOf({ city: 'Woodland', text: 'Pumpkins off County Road 98' })).toBeNull()
  })
})

const VINO = { name: 'Vino Tahoe', publicInfoUrl: 'https://www.vinotahoe.com/', address: '15010 Ridge Road, Sutter Creek, CA', city: 'Sutter Creek' }
const SUTTER_CREEK: [number, number] = [-120.8024, 38.393]
const RIDGE_ROAD: [number, number] = [-120.8401, 38.3655]

function fakeDb(anchorKind: 'area' | 'permanent' | null) {
  const calls: [string, unknown[]][] = []
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push([sql.replace(/\s+/g, ' ').trim(), params])
    if (/from public\.groups g/.test(sql)) return { rows: anchorKind ? [{ group_id: 'g1', anchor_kind: anchorKind, town_lng: SUTTER_CREEK[0], town_lat: SUTTER_CREEK[1] }] : [] }
    if (/insert into public\.locations/.test(sql)) return { rows: [{ id: 'loc-new' }] }
    return { rows: [] }
  })
  return { query, calls }
}

describe('pinUnclaimed', () => {
  it('a Page filed under its town moves to a pin at its street address', async () => {
    const db = fakeDb('area')
    const geocode = vi.fn(async () => [{ name: '15010 RIDGE RD, SUTTER CREEK, CA, 95685', coordinates: RIDGE_ROAD }])
    expect(await pinUnclaimed(db, VINO, geocode)).toEqual({ status: 'pinned', at: RIDGE_ROAD })
    expect(geocode).toHaveBeenCalledWith('15010 Ridge Road, Sutter Creek, CA')
    const insert = db.calls.find(([s]) => s.startsWith('insert into public.locations'))!
    expect(insert[0]).toMatch(/'permanent'/)
    expect(insert[1]).toEqual(expect.arrayContaining(['Vino Tahoe', '15010 Ridge Road, Sutter Creek, CA', 'SRID=4326;POINT(-120.8401 38.3655)']))
    const update = db.calls.find(([s]) => s.startsWith('update public.groups set anchor_location_id'))!
    expect(update[1]).toEqual(['loc-new', 'g1'])
  })

  it('already at its address: left alone, nothing looked up', async () => {
    const db = fakeDb('permanent')
    const geocode = vi.fn()
    expect(await pinUnclaimed(db, VINO, geocode)).toEqual({ status: 'already' })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('no street address: stays at its town', async () => {
    const db = fakeDb('area')
    const geocode = vi.fn()
    expect(await pinUnclaimed(db, { ...VINO, address: undefined }, geocode)).toEqual({ status: 'no-address' })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('an address that will not geocode, or lands far from its town, changes nothing', async () => {
    const miss = fakeDb('area')
    expect(await pinUnclaimed(miss, VINO, async () => [])).toEqual({ status: 'not-found' })
    const far = fakeDb('area')
    expect(await pinUnclaimed(far, VINO, async () => [{ name: '15010 RIDGE RD, SOMEWHERE ELSE', coordinates: [-118.2, 34.0] }])).toEqual({ status: 'not-found' })
    for (const db of [miss, far]) expect(db.calls.some(([s]) => /insert|update/.test(s))).toBe(false)
  })

  it('a dry run looks the address up and writes nothing', async () => {
    const db = fakeDb('area')
    expect(await pinUnclaimed(db, VINO, async () => [{ name: 'x', coordinates: RIDGE_ROAD }], { apply: false })).toEqual({ status: 'would-pin', at: RIDGE_ROAD })
    expect(db.calls.some(([s]) => /insert|update|begin/.test(s))).toBe(false)
  })

  it('a Page not in the database is reported, not created', async () => {
    expect(await pinUnclaimed(fakeDb(null), VINO, vi.fn())).toEqual({ status: 'missing' })
  })
})
