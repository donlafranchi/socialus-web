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

vi.mock('@/lib/geocoding', () => ({ geocode }))
vi.mock('@/app/you/sell/actions', () => ({
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

  it('shows a refusal message and selects nothing when the geocoder finds no match', async () => {
    geocode.mockResolvedValue([])
    render(<Harness />)
    fireEvent.change(screen.getByTestId('test-address-input'), {
      target: { value: 'not a real place at all' },
    })
    await vi.advanceTimersByTimeAsync(350)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn't find that address/i))
    expect(screen.queryByTestId('test-address-confirmed')).not.toBeInTheDocument()
  })

  it('does not search until at least 3 characters are typed', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByTestId('test-address-input'), { target: { value: '12' } })
    await vi.advanceTimersByTimeAsync(350)
    expect(geocode).not.toHaveBeenCalled()
  })
})

describe('LocationPlaceFields — neighbourhood mode', () => {
  it('switches mode, lazy-loads the neighbourhood list, and lets the Member choose one', async () => {
    listNeighborhoods.mockResolvedValue([
      { id: 'n1', name: 'Midtown', slug: 'midtown' },
      { id: 'n2', name: 'Oak Park', slug: 'oak-park' },
    ])
    let latest: LocationPlaceFieldsState = initialLocationPlaceFieldsState
    render(<Harness onState={(s) => (latest = s)} />)

    fireEvent.click(screen.getByTestId('test-mode-neighbourhood'))
    await waitFor(() => expect(listNeighborhoods).toHaveBeenCalledTimes(1))

    const select = await screen.findByTestId('test-neighbourhood-select')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1))
    fireEvent.change(select, { target: { value: 'n1' } })

    expect(latest.neighborhoodId).toBe('n1')
    expect(isLocationPlaceFieldsComplete(latest)).toBe(true)
  })

  it('switching back to address mode does not complete the fields on its own', () => {
    let latest: LocationPlaceFieldsState = { ...initialLocationPlaceFieldsState, mode: 'neighbourhood' }
    render(<Harness initial={latest} onState={(s) => (latest = s)} />)
    fireEvent.click(screen.getByTestId('test-mode-address'))
    expect(latest.mode).toBe('address')
    expect(isLocationPlaceFieldsComplete(latest)).toBe(false)
  })
})
