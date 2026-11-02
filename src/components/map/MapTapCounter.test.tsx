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
      ['directions', '/g/abc'],
      ['show_on_map', '/g/abc'],
    ])
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
