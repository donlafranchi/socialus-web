import { useState } from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import {
  LocationPlaceFields,
  initialLocationPlaceFieldsState,
  isLocationPlaceFieldsComplete,
  type LocationPlaceFieldsState,
} from './LocationPlaceFields'

const { geocode, listNeighborhoods, searchPlaces } = vi.hoisted(() => ({
  geocode: vi.fn(),
  listNeighborhoods: vi.fn(),
  searchPlaces: vi.fn(async (_q: string) => ({ ok: true, data: [] as unknown[] })),
}))

// #348 — the maps are their own components with their own tests; here they
// only report what the owner did.
vi.mock('./PinAdjustMap', () => ({
  PinAdjustMap: ({ onChange }: { onChange: (c: [number, number]) => void }) => (
    <button type="button" data-testid="pin-moved" onClick={() => onChange([-121.4999, 38.5811])} />
  ),
}))
vi.mock('./AreaPickMap', () => ({
  AreaPickMap: ({ onPick }: { onPick: (p: { placeId: string; name: string }) => void }) => (
    <button type="button" data-testid="area-tapped" onClick={() => onPick({ placeId: 'pl-curtis', name: 'Curtis Park' })} />
  ),
}))

vi.mock('@/lib/geocoding', () => ({
  geocode,
  // The component imports this to tell "cannot run" from "no match" (#107).
  GeocodingUnavailableError: class GeocodingUnavailableError extends Error {},
}))
vi.mock('@/app/_actions/location-actions', () => ({
  // Our own place search, stubbed: these tests are about the field, not the data.
  searchPlacesAction: searchPlaces,
  listNeighborhoodsAction: listNeighborhoods,
}))

function Harness({
  onState,
  initial = initialLocationPlaceFieldsState,
}: {
  onState?: (s: LocationPlaceFieldsState) => void
  initial?: LocationPlaceFieldsState
}) {
  const [state, setState] = useState(initial)
  return (
    <LocationPlaceFields
      state={state}
      setState={(next) => {
        setState(next)
        onState?.(next)
      }}
      idPrefix="test"
    />
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  geocode.mockReset()
  listNeighborhoods.mockReset()
  listNeighborhoods.mockResolvedValue([])
  searchPlaces.mockReset()
  searchPlaces.mockResolvedValue({ ok: true, data: [] })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('LocationPlaceFields — address mode', () => {
  it('searches after typing and lets the Member select a suggestion', async () => {
    geocode.mockResolvedValue([
      { name: '123 Main St, Sacramento, CA', coordinates: [-121.5, 38.58] },
    ])
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)

    fireEvent.change(screen.getByTestId('test-address-input'), {
      target: { value: '123 Main' },
    })
    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByTestId('test-address-suggestion-0')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('test-address-suggestion-0'))

    expect(latest.selectedAddress).toEqual({
      name: '123 Main St, Sacramento, CA',
      coordinates: [-121.5, 38.58],
    })
    expect(isLocationPlaceFieldsComplete(latest)).toBe(true)
  })

  it('says nothing was found, and points at the kinds that still work', async () => {
    geocode.mockResolvedValue([])
    render(<Harness />)
    fireEvent.change(screen.getByTestId('test-address-input'), {
      target: { value: 'not a real place at all' },
    })
    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/city or a neighbourhood/i))
    expect(screen.queryByTestId('test-address-confirmed')).not.toBeInTheDocument()
  })

  it('does not search on a single character', async () => {
    // Two, not three: "Oak" is three, but a city search wants to start sooner
    // than a street search did.
    render(<Harness />)
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: '1' } })
    await vi.advanceTimersByTimeAsync(350)
    expect(geocode).not.toHaveBeenCalled()
  })
})

describe('LocationPlaceFields — one field, three kinds of answer', () => {
  it('offers a city or a neighbourhood from our own data, with no geocoder', async () => {
    // The case that matters: Mapbox unavailable, and a person can still say
    // where they are. Production has run without a token.
    const { searchPlacesAction } = await import('@/app/_actions/location-actions')
    ;(searchPlacesAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: [{ id: 'n1', name: 'Oak Park', kind: 'neighborhood', parentName: 'Sacramento' }],
    })
    geocode.mockRejectedValue(new (await import('@/lib/geocoding')).GeocodingUnavailableError())

    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: 'oak' } })
    await vi.advanceTimersByTimeAsync(350)

    const opt = await screen.findByTestId('test-address-suggestion-0')
    expect(opt).toHaveTextContent('Oak Park')
    expect(opt).toHaveTextContent('Neighbourhood')
    expect(opt).toHaveTextContent('Sacramento')

    fireEvent.click(opt)
    expect(latest.neighborhoodId).toBe('n1')
    expect(isLocationPlaceFieldsComplete(latest)).toBe(true)
  })

  it('never shows the internal kind string', async () => {
    const { searchPlacesAction } = await import('@/app/_actions/location-actions')
    ;(searchPlacesAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: [{ id: 'c1', name: 'Davis', kind: 'city', parentName: null }],
    })
    geocode.mockResolvedValue([])
    const { container } = render(<Harness />)
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: 'davis' } })
    await vi.advanceTimersByTimeAsync(350)
    await screen.findByTestId('test-address-suggestion-0')
    expect(container.textContent).not.toContain('neighborhood')
  })
})

// Issue #180 — the dead end, found while embedding this in the Page edit form.
//
// `state.mode === 'address' ? (…) : null` meant "Rather give a neighbourhood?"
// replaced the control with an empty panel: no input, no list, no way back.
describe('neighbourhood mode shows something', () => {
  it('never renders an empty panel with no way out', () => {
    const state = { ...initialLocationPlaceFieldsState, mode: 'neighbourhood' as const }
    render(<LocationPlaceFields state={state} setState={vi.fn()} idPrefix="t" />)
    expect(screen.getByTestId('t-neighbourhood-chosen')).toBeInTheDocument()
    expect(screen.getByTestId('t-mode-address')).toBeInTheDocument()
  })

  it('names the place that was chosen', () => {
    const state = {
      ...initialLocationPlaceFieldsState,
      mode: 'neighbourhood' as const,
      neighborhoodId: 'pl-1',
      addressQuery: 'Oak Park',
    }
    render(<LocationPlaceFields state={state} setState={vi.fn()} idPrefix="t" />)
    expect(screen.getByTestId('t-neighbourhood-chosen')).toHaveTextContent('Oak Park')
  })

  it('goes back to searching, and clears what was chosen when it does', () => {
    const setState = vi.fn()
    const state = {
      ...initialLocationPlaceFieldsState,
      mode: 'neighbourhood' as const,
      neighborhoodId: 'pl-1',
      addressQuery: 'Oak Park',
    }
    render(<LocationPlaceFields state={state} setState={setState} idPrefix="t" />)
    fireEvent.click(screen.getByTestId('t-mode-address'))
    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'address', neighborhoodId: null, selectedAddress: null }),
    )
  })
})


describe('#348 — the address, confirmed on a map', () => {
  it('shows the pin map once an address is picked, and moving it moves the point', async () => {
    geocode.mockResolvedValue([{ name: '2700 24th St, Sacramento, CA', coordinates: [-121.5, 38.58] }])
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: '2700 24th' } })
    await vi.advanceTimersByTimeAsync(350)
    fireEvent.click(await screen.findByTestId('test-address-suggestion-0'))
    fireEvent.click(screen.getByTestId('pin-moved'))
    expect(latest.selectedAddress?.coordinates).toEqual([-121.4999, 38.5811])
    expect(latest.selectedAddress?.name).toBe('2700 24th St, Sacramento, CA')
  })
})

describe('#348 — neighbourhood only', () => {
  const toNeighbourhood = () => fireEvent.click(screen.getByTestId('test-mode-neighbourhood'))

  it('offers a search box over neighbourhoods and towns, and picking one completes it', async () => {
    searchPlaces.mockResolvedValue({ ok: true, data: [{ id: 'pl-cp', name: 'Curtis Park', kind: 'neighborhood', parentName: 'Sacramento' }] })
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)
    toNeighbourhood()
    fireEvent.change(screen.getByRole('combobox', { name: /neighbourhood or town/i }), { target: { value: 'Curt' } })
    await vi.advanceTimersByTimeAsync(350)
    fireEvent.click(await screen.findByRole('option', { name: /Curtis Park/ }))
    expect(latest.mode).toBe('neighbourhood')
    expect(latest.neighborhoodId).toBe('pl-cp')
    expect(isLocationPlaceFieldsComplete(latest)).toBe(true)
  })

  it('says only the neighbourhood will show', () => {
    render(<Harness />)
    toNeighbourhood()
    expect(screen.getByText(/only the neighbourhood shows/i)).toBeInTheDocument()
  })

  it('a tap on the map picks it too', () => {
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)
    toNeighbourhood()
    fireEvent.click(screen.getByTestId('area-tapped'))
    expect(latest.neighborhoodId).toBe('pl-curtis')
    expect(screen.getByTestId('test-neighbourhood-chosen')).toHaveTextContent('Curtis Park')
  })
})

describe('address search under React Strict Mode (dev and evals)', () => {
  it('still searches after Strict Mode mounts, unmounts and remounts the field', async () => {
    const { StrictMode } = await import('react')
    geocode.mockResolvedValue([{ name: '915 I St, Sacramento, CA, 95814', coordinates: [-121.494, 38.5817] }])
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: '915 I St, Sacramento, CA' } })
    expect(await screen.findByText('915 I St, Sacramento, CA, 95814')).toBeInTheDocument()
  })
})

describe('the address field says who sees it, before anyone types (nouns.md)', () => {
  it('describes the address box with who sees the address', () => {
    render(<Harness />)
    const input = screen.getByTestId('test-address-input')
    const hint = document.getElementById(input.getAttribute('aria-describedby')!.split(' ')[0]!)
    expect(hint).toHaveTextContent(/signed-in visitors see this address/i)
  })
})

describe('#348 — drop a pin, no address needed', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test'))
  afterEach(() => vi.unstubAllEnvs())

  it('is offered only where there is a map to drop it on', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '')
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /drop a pin instead/i })).toBeNull()
  })

  it('sets a pinned spot, and moving the map moves it', () => {
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)
    fireEvent.click(screen.getByRole('button', { name: /drop a pin instead/i }))
    fireEvent.click(screen.getByTestId('pin-moved'))
    expect(latest.selectedAddress).toEqual({ name: 'Dropped pin', coordinates: [-121.4999, 38.5811] })
    expect(isLocationPlaceFieldsComplete(latest)).toBe(true)
  })
})
