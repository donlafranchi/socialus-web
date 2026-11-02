import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { MapTapCounter } from './MapTapCounter'

const log = vi.fn()
vi.mock('@/app/_actions/map-actions', () => ({ logMapTapAction: (...a: unknown[]) => log(...a) }))

afterEach(() => {
  cleanup()
  log.mockReset()
})

describe('MapTapCounter (plan #258)', () => {
  it('counts a tap on anything marked Show on map or Directions, with the page it happened on', () => {
    window.history.replaceState(null, '', '/g/abc')
    render(
      <>
        <MapTapCounter />
        <a href="https://maps.apple.com/?daddr=1" data-map-tap="directions" onClick={(e) => e.preventDefault()}>
          <span>Directions</span>
        </a>
        <button data-map-tap="show_on_map">Show on map</button>
        <button>Something else</button>
      </>,
    )
    fireEvent.click(screen.getByText('Directions'))
    fireEvent.click(screen.getByText('Show on map'))
    fireEvent.click(screen.getByText('Something else'))
    expect(log.mock.calls).toEqual([
      ['directions', 'https://maps.apple.com/?daddr=1'],
      ['show_on_map', '/g/abc'],
    ])
  })

  it('two Directions on one page are two places', () => {
    render(
      <>
        <MapTapCounter />
        <a href="https://maps.apple.com/?daddr=1" data-map-tap="directions" onClick={(e) => e.preventDefault()}>one</a>
        <a href="https://maps.apple.com/?daddr=2" data-map-tap="directions" onClick={(e) => e.preventDefault()}>two</a>
      </>,
    )
    fireEvent.click(screen.getByText('one'))
    fireEvent.click(screen.getByText('two'))
    expect(new Set(log.mock.calls.map((c) => c[1])).size).toBe(2)
  })

  it('ignores a mark it does not know', () => {
    render(
      <>
        <MapTapCounter />
        <button data-map-tap="nope">x</button>
      </>,
    )
    fireEvent.click(screen.getByText('x'))
    expect(log).not.toHaveBeenCalled()
  })
})
