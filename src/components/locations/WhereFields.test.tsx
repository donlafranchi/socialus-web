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
function Harness({ initial = emptyWhere, savedPin }: { initial?: WhereValue; savedPin?: [number, number] | null }) {
  const [v, setV] = useState(initial)
  return (
    <WhereFields
      savedPin={savedPin}
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

describe('#896 — one question, seven answers', () => {
  it('asks one question with seven answers, and nothing else until one is chosen', async () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: /how do people find you/i })).toBeInTheDocument()
    const names = [/^street address/i, /^neighbourhood only/i, /^cross streets or a landmark/i, /^more than one location/i, /^it moves/i, /^i go to them/i, /^online only, or by appointment/i]
    expect(screen.getAllByRole('radio')).toHaveLength(7)
    for (const name of names) expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  // Don, 2026-10-18 [always]: no chip or pill UI — a plain radio list, no switches.
  it('a plain radio list: no chips, pills or switches', async () => {
    const { container } = render(<Harness />)
    for (const name of [/^street address/i, /^neighbourhood only/i, /^i go to them/i]) {
      fireEvent.click(screen.getByRole('radio', { name }))
      expect(screen.queryByRole('switch')).toBeNull()
    }
    fireEvent.click(await screen.findByTestId('town-tapped'))
    expect(container.querySelector('[class*="rounded-full"]')).toBeNull()
  })
})

describe('#896 — the answers with no street address', () => {
  it('cross streets or a landmark: its words, and a pin to put where it is', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /cross streets or a landmark/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /^cross streets or landmark/i }), { target: { value: 'J St & 20th St' } })
    expect(latest.mode).toBe('landmark')
    expect(latest.landmark.text).toBe('J St & 20th St')
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click(await screen.findByTestId('pin-moved'))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
  })

  it('more than one location: an address each, added and removed', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /more than one location/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Address 1' }), { target: { value: '2700 K St' } })
    fireEvent.click(screen.getByRole('button', { name: /add another location/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Address 3' }), { target: { value: '915 I St' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove address 2' }))
    expect(latest.mode).toBe('multi')
    expect(latest.multi.addresses).toEqual(['2700 K St', '915 I St'])
  })

  it('it moves: where and when, a stop at a time', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /^it moves/i }))
    fireEvent.click(screen.getByRole('button', { name: /add a stop/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Where' }), { target: { value: 'Midtown Farmers Market' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'When' }), { target: { value: 'Saturdays, 8am–1pm' } })
    expect(latest.roaming.stops).toEqual([{ where: 'Midtown Farmers Market', when: 'Saturdays, 8am–1pm' }])
    fireEvent.click(screen.getByRole('button', { name: /remove this stop/i }))
    expect(latest.roaming.stops).toEqual([])
  })

  it('online only, or by appointment: an optional note, no map', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /online only/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /anything to add/i }), { target: { value: 'By appointment in Midtown' } })
    expect(latest.mode).toBe('online')
    expect(latest.online.note).toBe('By appointment in Midtown')
    expect(screen.queryByTestId('pin-moved')).toBeNull()
    expect(screen.queryByRole('button', { name: /drop a pin/i })).toBeNull()
  })
})

describe('Street address, or the neighbourhood only', () => {
  const choose = () => fireEvent.click(screen.getByRole('radio', { name: /^street address/i }))
  const chooseArea = () => fireEvent.click(screen.getByRole('radio', { name: /^neighbourhood only/i }))

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
    expect((await screen.findByTestId('pin-moved'))).toHaveAttribute('data-center', '-121.494,38.5817')
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

  it('neighbourhood only: picked by name, the pin starts at its centre', async () => {
    searchNeighborhoods.mockResolvedValue({ ok: true, data: [{ placeId: 'pl-curtis', name: 'Curtis Park', centroid: [-121.49, 38.55] }] })
    render(<Harness />)
    chooseArea()
    fireEvent.change(screen.getByRole('combobox', { name: /neighbourhood/i }), { target: { value: 'Curt' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
    expect(searchNeighborhoods).toHaveBeenCalledWith('Curt')
    expect(latest.visit.pin).toEqual([-121.49, 38.55])
    expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' })
    expect(latest.visit.label).toBeNull()
    expect((await screen.findByTestId('pin-moved'))).toHaveAttribute('data-center', '-121.49,38.55')
    expect(screen.getByText('Curtis Park')).toBeInTheDocument()
    fireEvent.click((await screen.findByTestId('pin-moved')))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
  })

  // bug #440 — a neighbourhood pick saved and published a street address.
  it('a neighbourhood pick shows only the neighbourhood, and keeps the one picked', async () => {
    placeForPoint.mockResolvedValue({ ok: true, data: { id: 'pl-other', name: 'Somewhere else' } })
    searchNeighborhoods.mockResolvedValue({ ok: true, data: [{ placeId: 'pl-curtis', name: 'Curtis Park', centroid: [-121.49, 38.55] }] })
    render(<Harness />)
    chooseArea()
    fireEvent.change(screen.getByRole('combobox', { name: /neighbourhood/i }), { target: { value: 'Curt' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Curtis Park' }))
    expect(latest.visit.areaOnly).toBe(true)
    expect(screen.getByRole('radio', { name: /^neighbourhood only/i })).toBeChecked()
    await new Promise((r) => setTimeout(r, 0))
    expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' })
    const createLocation = vi.fn().mockResolvedValue({ ok: true, data: { id: 'loc-1' } })
    const label = vi.fn().mockResolvedValue('1 Some St, Sacramento')
    const saved = await wherePatch(latest, null, { createLocation, metroAnchor: vi.fn(), label } as never)
    expect(saved).toMatchObject({ ok: true })
    expect(createLocation).toHaveBeenCalledWith({ label: 'Curtis Park', neighborhoodId: 'pl-curtis' })
    expect(label).not.toHaveBeenCalled()
  })

  it('a street address offers no neighbourhood, and the neighbourhood no street address', async () => {
    render(<Harness />)
    choose()
    expect(screen.queryByRole('combobox', { name: /neighbourhood/i })).toBeNull()
    chooseArea()
    expect(screen.queryByRole('combobox', { name: /^address/i })).toBeNull()
  })

  it('shows the map for a pin already set', async () => {
    render(<Harness initial={{ ...emptyWhere, mode: 'visit', visit: { ...emptyWhere.visit, pin: [-121.4, 38.5] } }} />)
    expect((await screen.findByTestId('pin-moved'))).toBeInTheDocument()
  })

  // Tidy and contained (the PM, 2026-10-06): once the map is showing, "Drop a pin" has nothing left to do.
  it('offers "Drop a pin" only until there is a pin', async () => {
    render(<Harness initial={{ ...emptyWhere, mode: 'visit', visit: { ...emptyWhere.visit, pin: [-121.4, 38.5] } }} />)
    expect(screen.queryByRole('button', { name: /drop a pin/i })).toBeNull()
  })

  // #455 — the PM, 2026-10-06: the map opens on the saved pin, not on the default point.
  it('opens the map on the saved pin, leaving it unchanged until it is moved', async () => {
    render(<Harness savedPin={[-121.47, 38.57]} initial={{ ...emptyWhere, mode: 'visit' }} />)
    expect((await screen.findByTestId('pin-moved'))).toHaveAttribute('data-center', '-121.47,38.57')
    expect(screen.queryByRole('button', { name: /drop a pin/i })).toBeNull()
    fireEvent.click((await screen.findByTestId('pin-moved')))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
  })

  it('a Page with no saved pin still starts with "Drop a pin"', async () => {
    render(<Harness savedPin={null} initial={{ ...emptyWhere, mode: 'visit' }} />)
    expect(screen.queryByTestId('pin-moved')).toBeNull()
    expect(screen.getByRole('button', { name: /drop a pin/i })).toBeInTheDocument()
  })

  it('or drops a pin with no address, and moving the map moves it', async () => {
    render(<Harness />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click((await screen.findByTestId('pin-moved')))
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

  it('takes an optional one-line "How to find us"', async () => {
    render(<Harness />)
    choose()
    fireEvent.change(screen.getByRole('textbox', { name: /how to find us/i }), { target: { value: 'Trailhead behind the barn' } })
    expect(latest.visit.howToFind).toBe('Trailhead behind the barn')
    expect(screen.getByRole('textbox', { name: /how to find us/i })).toHaveAttribute('maxlength', '140')
  })

  it('neighbourhood only names the neighbourhood worked out from a dropped pin', async () => {
    render(<Harness />)
    chooseArea()
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click((await screen.findByTestId('pin-moved')))
    await waitFor(() => expect(screen.getByText(/visitors see curtis park/i)).toBeInTheDocument())
    expect(latest.visit.areaOnly).toBe(true)
    expect(latest.visit.area).toEqual({ id: 'pl-curtis', name: 'Curtis Park' })
    expect(placeForPoint).toHaveBeenCalledWith(-121.5, 38.58)
  })
})

describe('I go to them', () => {
  it('defaults to the whole metro, and towns tapped on the map are added and removable', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /i go to them/i }))
    expect(screen.getByText(/the whole sacramento area/i)).toBeInTheDocument()
    fireEvent.click((await screen.findByTestId('town-tapped')))
    expect(latest.travel.towns).toEqual([{ id: 'pl-davis', name: 'Davis' }])
    fireEvent.click(screen.getByRole('button', { name: /remove davis/i }))
    expect(latest.travel.towns).toEqual([])
  })

  it('the map offers towns, not neighbourhoods', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /i go to them/i }))
    expect((await screen.findByTestId('town-tapped'))).toHaveAttribute('data-kinds', 'city')
  })
})

describe('It moves', () => {
  it('is the whole metro, with an optional "Usually around"', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: /it moves/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /usually around/i }), { target: { value: 'Midtown farmers markets' } })
    expect(latest.mode).toBe('roaming')
    expect(latest.roaming.usuallyAround).toBe('Midtown farmers markets')
  })
})
