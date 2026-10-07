// #348 — where a Page is: one question, three answers (Don, 2026-10-04).

import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { WhereFields, emptyWhere, type WhereValue } from './WhereFields'
import { wherePatch } from './where-save'

const { geocode, placeForPoint, searchPlaces, searchNeighborhoods } = vi.hoisted(() => ({
  geocode: vi.fn(),
  placeForPoint: vi.fn(),
  searchPlaces: vi.fn(),
  searchNeighborhoods: vi.fn(),
}))
vi.mock('@/lib/geocoding', () => ({ geocode }))
vi.mock('@/app/_actions/location-actions', () => ({
  placeForPointAction: placeForPoint,
  searchPlacesAction: searchPlaces,
  searchNeighborhoodsAction: searchNeighborhoods,
}))
vi.mock('./PinAdjustMap', () => ({
  PinAdjustMap: ({ center, onChange }: { center: [number, number]; onChange: (c: [number, number]) => void }) => (
    <button type="button" data-testid="pin-moved" data-center={center.join(',')} onClick={() => onChange([-121.5, 38.58])} />
  ),
}))
vi.mock('./AreaPickMap', () => ({
  AreaPickMap: ({ onPick, kinds }: { onPick: (p: { placeId: string; name: string }) => void; kinds?: string[] }) => (
    <button type="button" data-testid="town-tapped" data-kinds={kinds?.join(',')} onClick={() => onPick({ placeId: 'pl-davis', name: 'Davis' })} />
  ),
}))

let latest: WhereValue
function Harness({ initial = emptyWhere }: { initial?: WhereValue }) {
  const [v, setV] = useState(initial)
  return (
    <WhereFields
      value={v}
      onChange={(n) => {
        latest = n
        setV(n)
      }}
    />
  )
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test')
  latest = emptyWhere
  geocode.mockReset()
  placeForPoint.mockReset()
  placeForPoint.mockResolvedValue({ ok: true, data: { id: 'pl-curtis', name: 'Curtis Park' } })
  searchPlaces.mockReset()
  searchPlaces.mockResolvedValue({ ok: true, data: [] })
  searchNeighborhoods.mockReset()
  searchNeighborhoods.mockResolvedValue({ ok: true, data: [] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('#348 — one question, three answers', () => {
  it('asks one question with three answers, and nothing else until one is chosen', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: /how do people find you/i })).toBeInTheDocument()
    for (const name of [/people come to me/i, /i go to them/i, /it moves, or it.s online/i]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('People come to me', () => {
  const choose = () => fireEvent.click(screen.getByRole('radio', { name: /people come to me/i }))

  const address = () => screen.getByRole('combobox', { name: /^address/i })
  const FOUND = [
    { name: '915 I ST, SACRAMENTO, CA, 95814', coordinates: [-121.494, 38.5817] },
    { name: '915 J ST, SACRAMENTO, CA, 95814', coordinates: [-121.493, 38.5807] },
  ]

  it('suggests addresses as the owner types, and a chosen one goes on the map', async () => {
    geocode.mockResolvedValue(FOUND)
    render(<Harness />)
    choose()
    expect(screen.queryByTestId('pin-moved')).toBeNull()
    fireEvent.change(address(), { target: { value: '915 I St' } })
    fireEvent.click(await screen.findByRole('option', { name: /915 I ST/ }))
    expect(geocode).toHaveBeenCalledWith('915 I St')
    expect(latest.visit.pin).toEqual([-121.494, 38.5817])
    expect(latest.visit.label).toBe('915 I ST, SACRAMENTO, CA, 95814')
    expect(screen.getByTestId('pin-moved')).toHaveAttribute('data-center', '-121.494,38.5817')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('waits for three letters and a pause before it searches', async () => {
    geocode.mockResolvedValue(FOUND)
    render(<Harness />)
    choose()
    fireEvent.change(address(), { target: { value: '91' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(geocode).not.toHaveBeenCalled()
    fireEvent.change(address(), { target: { value: '915' } })
    fireEvent.change(address(), { target: { value: '915 I' } })
    fireEvent.change(address(), { target: { value: '915 I St' } })
    await screen.findAllByRole('option')
    expect(geocode).toHaveBeenCalledTimes(1)
    expect(geocode).toHaveBeenCalledWith('915 I St')
  })

  it('the suggestions are a listbox the arrow keys and Enter work', async () => {
    geocode.mockResolvedValue(FOUND)
    render(<Harness />)
    choose()
    expect(address()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.change(address(), { target: { value: '915 I St' } })
    await screen.findAllByRole('option')
    expect(address()).toHaveAttribute('aria-expanded', 'true')
    expect(address()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    fireEvent.keyDown(address(), { key: 'ArrowDown' })
    fireEvent.keyDown(address(), { key: 'ArrowDown' })
    const active = screen.getByRole('option', { name: /915 J ST/ })
    expect(address()).toHaveAttribute('aria-activedescendant', active.id)
    expect(active).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(address(), { key: 'Enter' })
    expect(latest.visit.pin).toEqual([-121.493, 38.5807])
    expect(address()).toHaveAttribute('aria-expanded', 'false')
  })

  it('says so when nothing matches the address', async () => {
    geocode.mockResolvedValue([])
    render(<Harness />)
    choose()
    fireEvent.change(address(), { target: { value: 'zzzz' } })
    expect(await screen.findByText(/couldn.t find that address/i)).toBeInTheDocument()
  })

  it('or types a neighbourhood: the pin starts at its centre, named, ready to drag to the door', async () => {
    searchNeighborhoods.mockResolvedValue({ ok: true, data: [{ placeId: 'pl-curtis', name: 'Curtis Park', centroid: [-121.49, 38.55] }] })
    render(<Harness />)
    choose()
    fireEvent.change(screen.getByRole('combobox', { name: /or type a neighbourhood/i }), { target: { value: 'Curt' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
    expect(searchNeighborhoods).toHaveBeenCalledWith('Curt')
    expect(latest.visit.pin).toEqual([-121.49, 38.55])
    expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' })
    expect(latest.visit.label).toBeNull()
    expect(screen.getByTestId('pin-moved')).toHaveAttribute('data-center', '-121.49,38.55')
    expect(screen.getByText('Curtis Park')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pin-moved'))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
  })

  // bug #440 — 2026-10-04: a neighbourhood is given instead of a street address, and only it shows.
  it('picking a neighbourhood shows only the neighbourhood, and saves it, never an address', async () => {
    searchNeighborhoods.mockResolvedValue({ ok: true, data: [{ placeId: 'pl-curtis', name: 'Curtis Park', centroid: [-121.49, 38.55] }] })
    render(<Harness />)
    choose()
    fireEvent.change(screen.getByRole('combobox', { name: /or type a neighbourhood/i }), { target: { value: 'Curt' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
    expect(latest.visit.areaOnly).toBe(true)
    expect(screen.getByRole('switch', { name: /show only my neighbourhood/i })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' }))

    const createLocation = vi.fn().mockResolvedValue({ ok: true, data: { id: 'loc-1' } })
    const label = vi.fn().mockResolvedValue('1 Some St, Sacramento')
    const saved = await wherePatch(latest, null, { createLocation, metroAnchor: vi.fn(), label } as never)
    expect(saved).toMatchObject({ ok: true })
    expect(createLocation).toHaveBeenCalledWith({ label: 'Curtis Park', neighborhoodId: 'pl-curtis' })
    expect(label).not.toHaveBeenCalled()
  })

  it('the two ways in replace each other: choosing one clears the other', async () => {
    geocode.mockResolvedValue(FOUND)
    searchNeighborhoods.mockResolvedValue({ ok: true, data: [{ placeId: 'pl-curtis', name: 'Curtis Park', centroid: [-121.49, 38.55] }] })
    render(<Harness />)
    choose()
    fireEvent.change(address(), { target: { value: '915 I St' } })
    fireEvent.click(await screen.findByRole('option', { name: /915 I ST/ }))
    const area = screen.getByRole('combobox', { name: /or type a neighbourhood/i })
    fireEvent.change(area, { target: { value: 'Curt' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
    expect(address()).toHaveValue('')
    fireEvent.change(address(), { target: { value: '915 I St' } })
    fireEvent.click(await screen.findByRole('option', { name: /915 I ST/ }))
    expect(screen.getByRole('combobox', { name: /or type a neighbourhood/i })).toHaveValue('')
  })

  it('shows the map for a pin already set', () => {
    render(<Harness initial={{ ...emptyWhere, mode: 'visit', visit: { ...emptyWhere.visit, pin: [-121.4, 38.5] } }} />)
    expect(screen.getByTestId('pin-moved')).toBeInTheDocument()
  })

  // Tidy and contained (the PM, 2026-10-06): once the map is showing, "Drop a pin" has nothing left to do.
  it('offers "Drop a pin" only until there is a pin', () => {
    render(<Harness initial={{ ...emptyWhere, mode: 'visit', visit: { ...emptyWhere.visit, pin: [-121.4, 38.5] } }} />)
    expect(screen.queryByRole('button', { name: /drop a pin/i })).toBeNull()
  })

  it('or drops a pin with no address, and moving the map moves it', () => {
    render(<Harness />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click(screen.getByTestId('pin-moved'))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
    expect(latest.visit.label).toBeNull()
  })

  it('with no map, there is nothing to drop a pin or drag it on: the address is looked up on request', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    geocode.mockResolvedValue(FOUND)
    render(<Harness />)
    choose()
    expect(screen.queryByRole('button', { name: /drop a pin/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /neighbourhood/i })).toBeNull()
    const field = screen.getByRole('textbox', { name: /^address/i })
    fireEvent.change(field, { target: { value: '915 I St, Sacramento' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(geocode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /find it/i }))
    fireEvent.click(await screen.findByRole('button', { name: /915 I ST/ }))
    expect(latest.visit.pin).toEqual([-121.494, 38.5817])
  })

  it('takes an optional one-line "How to find us"', () => {
    render(<Harness />)
    choose()
    fireEvent.change(screen.getByRole('textbox', { name: /how to find us/i }), { target: { value: 'Trailhead behind the barn' } })
    expect(latest.visit.howToFind).toBe('Trailhead behind the barn')
    expect(screen.getByRole('textbox', { name: /how to find us/i })).toHaveAttribute('maxlength', '140')
  })

  it('"Show only my neighbourhood" names the neighbourhood worked out from the pin', async () => {
    render(<Harness />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click(screen.getByTestId('pin-moved'))
    fireEvent.click(screen.getByRole('switch', { name: /show only my neighbourhood/i }))
    await waitFor(() => expect(screen.getByText(/visitors see curtis park/i)).toBeInTheDocument())
    expect(latest.visit.areaOnly).toBe(true)
    expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' })
    expect(placeForPoint).toHaveBeenCalledWith(-121.5, 38.58)
  })
})

describe('I go to them', () => {
  it('defaults to the whole metro, and towns tapped on the map are added and removable', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /i go to them/i }))
    expect(screen.getByText(/the whole sacramento area/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('town-tapped'))
    expect(latest.travel.towns).toEqual([{ id: 'pl-davis', name: 'Davis' }])
    fireEvent.click(screen.getByRole('button', { name: /remove davis/i }))
    expect(latest.travel.towns).toEqual([])
  })

  it('the map offers towns, not neighbourhoods', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /i go to them/i }))
    expect(screen.getByTestId('town-tapped')).toHaveAttribute('data-kinds', 'city')
  })
})

describe('It moves, or it’s online', () => {
  it('is the whole metro, with an optional "Usually around"', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /it moves/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /usually around/i }), { target: { value: 'Midtown farmers markets' } })
    expect(latest.mode).toBe('roaming')
    expect(latest.roaming.usuallyAround).toBe('Midtown farmers markets')
  })
})
