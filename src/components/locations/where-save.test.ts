import { describe, it, expect, vi } from 'vitest'
import { wherePatch, whereValueFrom } from './where-save'
import { emptyWhere, type WhereValue } from './WhereFields'

vi.mock('@/app/_actions/location-actions', () => ({}))

const deps = () => ({
  createLocation: vi.fn(async () => ({ ok: true as const, data: { id: 'loc-1', label: 'x' } })),
  metroAnchor: vi.fn(),
  label: vi.fn(async () => '1 Example St'),
})

describe('wherePatch', () => {
  // bug #440 — a Page that chose a neighbourhood must never publish a street address.
  it('saves a neighbourhood as the neighbourhood, never an address point', async () => {
    const d = deps()
    const where: WhereValue = {
      ...emptyWhere,
      mode: 'visit',
      visit: { ...emptyWhere.visit, pin: [-121.49, 38.55], areaOnly: true, area: { id: 'pl-curtis', name: 'Curtis Park' } },
    }
    const out = await wherePatch(where, null, d as never)
    expect(out).toMatchObject({ ok: true, patch: { anchorLocationId: 'loc-1', whereMode: 'visit' } })
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'Curtis Park', neighborhoodId: 'pl-curtis' })
    expect(d.label).not.toHaveBeenCalled()
  })
})

describe('whereValueFrom', () => {
  const saved = { mode: 'visit' as const, howToFind: null, usuallyAround: null, towns: [] }
  // #455 — a Page saved as a neighbourhood reopens as one; the pin itself stays out of the value.
  it('carries a saved neighbourhood as "show only my neighbourhood", with no pin', () => {
    const v = whereValueFrom(saved, { kind: 'area', label: 'Curtis Park', lng: -121.49, lat: 38.55 })
    expect(v.visit).toMatchObject({ pin: null, areaOnly: true, area: { name: 'Curtis Park' } })
  })
  it('a saved address is not area-only', () => {
    const v = whereValueFrom(saved, { kind: 'point', label: '1 Example St', lng: -121.49, lat: 38.55 })
    expect(v.visit).toMatchObject({ pin: null, areaOnly: false, area: null })
  })
  // #894 — a Page that moves is anchored to the metro; its centre's neighbourhood is not the Page's.
  it('a Page that moves carries no neighbourhood into "People come to me"', () => {
    const v = whereValueFrom({ ...saved, mode: 'roaming' }, { kind: 'area', label: 'East Sacramento', lng: -121.46, lat: 38.56 })
    expect(v.visit).toMatchObject({ areaOnly: false, area: null })
  })
})

// #896 — the new answers save what they say, and only that.
describe('#896 — wherePatch for every answer', () => {
  const metro = () => ({ ok: true as const, data: { id: 'pl-sac', name: 'Sacramento' } })

  it('a landmark saves its own words at its pin', async () => {
    const d = deps()
    const where: WhereValue = { ...emptyWhere, mode: 'landmark', landmark: { text: ' J St & 20th St ' }, visit: { ...emptyWhere.visit, pin: [-121.47, 38.57], howToFind: 'By the fountain' } }
    const out = await wherePatch(where, null, d as never)
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'J St & 20th St', address: { geographyWkt: 'SRID=4326;POINT(-121.47 38.57)', resolvedAddressText: 'J St & 20th St' } })
    expect(out).toMatchObject({ ok: true, patch: { anchorLocationId: 'loc-1', whereMode: 'landmark', howToFind: 'By the fountain', stops: [] } })
  })

  it('a landmark keeps its saved pin when only the words change', async () => {
    const d = deps()
    const where: WhereValue = { ...emptyWhere, mode: 'landmark', landmark: { text: 'Under the oak' } }
    await wherePatch(where, 'landmark', { ...d, savedPin: [-121.4, 38.5] } as never)
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'Under the oak', address: { geographyWkt: 'SRID=4326;POINT(-121.4 38.5)', resolvedAddressText: 'Under the oak' } })
  })

  it('a landmark needs its words and a pin', async () => {
    expect(await wherePatch({ ...emptyWhere, mode: 'landmark', visit: { ...emptyWhere.visit, pin: [-121.47, 38.57] } }, null, deps() as never)).toEqual({ ok: false, message: 'Add the cross streets or a landmark.' })
    expect(await wherePatch({ ...emptyWhere, mode: 'landmark', landmark: { text: 'Under the oak' } }, null, deps() as never)).toBeNull()
  })

  it('more than one location: each address a stop, anchored to the metro', async () => {
    const d = { ...deps(), metroAnchor: vi.fn(async () => metro()) }
    const where: WhereValue = { ...emptyWhere, mode: 'multi', multi: { addresses: ['2700 K St', '  ', '915 I St'] } }
    const out = await wherePatch(where, null, d as never)
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'Sacramento', neighborhoodId: 'pl-sac' })
    expect(out).toMatchObject({ ok: true, patch: { whereMode: 'multi', stops: [{ label: '2700 K St', whenText: null }, { label: '915 I St', whenText: null }] } })
  })

  it('more than one location needs an address', async () => {
    expect(await wherePatch({ ...emptyWhere, mode: 'multi', multi: { addresses: ['', ' '] } }, null, deps() as never)).toEqual({ ok: false, message: 'Add at least one address.' })
  })

  it('it moves: where it usually is, and where and when', async () => {
    const d = { ...deps(), metroAnchor: vi.fn(async () => metro()) }
    const where: WhereValue = { ...emptyWhere, mode: 'roaming', roaming: { usuallyAround: 'Midtown', stops: [{ where: 'Midtown Farmers Market', when: 'Saturdays' }, { where: '', when: 'Sundays' }] } }
    const out = await wherePatch(where, null, d as never)
    expect(out).toMatchObject({ ok: true, patch: { whereMode: 'roaming', usuallyAround: 'Midtown', stops: [{ label: 'Midtown Farmers Market', whenText: 'Saturdays' }] } })
  })

  it('online: no place, the note, anchored to the metro only', async () => {
    const d = { ...deps(), metroAnchor: vi.fn(async () => metro()) }
    const out = await wherePatch({ ...emptyWhere, mode: 'online', online: { note: 'By appointment' } }, null, d as never)
    expect(d.createLocation).toHaveBeenCalledWith({ label: 'Sacramento', neighborhoodId: 'pl-sac' })
    expect(out).toMatchObject({ ok: true, patch: { whereMode: 'online', howToFind: 'By appointment', stops: [], serviceAreaPlaceIds: [] } })
  })

  it('a street address clears any stops left from another answer', async () => {
    const where: WhereValue = { ...emptyWhere, mode: 'visit', visit: { ...emptyWhere.visit, pin: [-121.47, 38.57] } }
    expect(await wherePatch(where, null, deps() as never)).toMatchObject({ ok: true, patch: { whereMode: 'visit', stops: [] } })
  })
})

describe('#896 — whereValueFrom for every answer', () => {
  const saved = { howToFind: null, usuallyAround: null, towns: [] }
  it('a landmark reopens with its words', () => {
    const v = whereValueFrom({ ...saved, mode: 'landmark', howToFind: 'By the fountain' }, { kind: 'point', label: 'J St & 20th St', lng: -121.47, lat: 38.57 })
    expect(v.landmark.text).toBe('J St & 20th St')
    expect(v.visit.howToFind).toBe('By the fountain')
  })
  it('more than one location reopens with its addresses', () => {
    const v = whereValueFrom({ ...saved, mode: 'multi', stops: [{ label: '2700 K St', whenText: null }] }, null)
    expect(v.multi.addresses).toEqual(['2700 K St'])
  })
  it('it moves reopens with where and when', () => {
    const v = whereValueFrom({ ...saved, mode: 'roaming', stops: [{ label: 'Midtown Farmers Market', whenText: 'Saturdays' }] }, null)
    expect(v.roaming.stops).toEqual([{ where: 'Midtown Farmers Market', when: 'Saturdays' }])
  })
  it('online reopens with its note', () => {
    expect(whereValueFrom({ ...saved, mode: 'online', howToFind: 'By appointment' }, null).online.note).toBe('By appointment')
  })
})
