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

const { geocode, listNeighborhoods } = vi.hoisted(() => ({
  geocode: vi.fn(),
  listNeighborhoods: vi.fn(),
}))

vi.mock('@/lib/geocoding', () => ({
  geocode,
  // The component imports this to tell "cannot run" from "no match" (#107).
  GeocodingUnavailableError: class GeocodingUnavailableError extends Error {},
}))
vi.mock('@/app/you/sell/actions', () => ({
  // Our own place search, stubbed: these tests are about the field, not the data.
  sellSearchPlacesAction: vi.fn(async () => ({ ok: true, data: [] })),
  sellListNeighborhoodsAction: listNeighborhoods,
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
    const { sellSearchPlacesAction } = await import('@/app/you/sell/actions')
    ;(sellSearchPlacesAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    const { sellSearchPlacesAction } = await import('@/app/you/sell/actions')
    ;(sellSearchPlacesAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
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
