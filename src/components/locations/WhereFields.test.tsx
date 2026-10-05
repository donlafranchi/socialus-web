// #348 — where a Page is: one question, three answers (Don, 2026-10-04).

import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { WhereFields, emptyWhere, type WhereValue } from './WhereFields'

const { geocode, placeForPoint, searchPlaces } = vi.hoisted(() => ({
  geocode: vi.fn(),
  placeForPoint: vi.fn(),
  searchPlaces: vi.fn(),
}))
vi.mock('@/lib/geocoding', () => ({ geocode }))
vi.mock('@/app/_actions/location-actions', () => ({
  placeForPointAction: placeForPoint,
  searchPlacesAction: searchPlaces,
}))
vi.mock('./PinAdjustMap', () => ({
  PinAdjustMap: ({ onChange }: { onChange: (c: [number, number]) => void }) => (
    <button type="button" data-testid="pin-moved" onClick={() => onChange([-121.5, 38.58])} />
  ),
}))
vi.mock('./AreaPickMap', () => ({
  AreaPickMap: ({ onPick }: { onPick: (p: { placeId: string; name: string }) => void }) => (
    <button type="button" data-testid="town-tapped" onClick={() => onPick({ placeId: 'pl-davis', name: 'Davis' })} />
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
  latest = emptyWhere
  geocode.mockReset()
  placeForPoint.mockReset()
  placeForPoint.mockResolvedValue({ ok: true, data: { id: 'pl-curtis', name: 'Curtis Park' } })
  searchPlaces.mockReset()
  searchPlaces.mockResolvedValue({ ok: true, data: [] })
})
afterEach(cleanup)

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

  it('finds an address, then shows it on the map to confirm', async () => {
    geocode.mockResolvedValue([{ name: '915 I ST, SACRAMENTO, CA, 95814', coordinates: [-121.494, 38.5817] }])
    render(<Harness />)
    choose()
    fireEvent.change(screen.getByRole('textbox', { name: /address/i }), { target: { value: '915 I St, Sacramento' } })
    fireEvent.click(screen.getByRole('button', { name: /find it/i }))
    fireEvent.click(await screen.findByRole('button', { name: /915 I ST/ }))
    expect(latest.visit.pin).toEqual([-121.494, 38.5817])
    expect(latest.visit.label).toBe('915 I ST, SACRAMENTO, CA, 95814')
    expect(screen.getByTestId('pin-moved')).toBeInTheDocument()
  })

  it('or drops a pin with no address, and moving the map moves it', () => {
    render(<Harness />)
    choose()
    fireEvent.click(screen.getByRole('button', { name: /drop a pin/i }))
    fireEvent.click(screen.getByTestId('pin-moved'))
    expect(latest.visit.pin).toEqual([-121.5, 38.58])
    expect(latest.visit.label).toBeNull()
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
