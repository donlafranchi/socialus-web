import { describe, it, expect } from 'vitest'
import { stylePin, styleCluster, styleTeardrop, styleAreaMarker } from './map-pins'

describe('Don, 2026-10-05 — one marker style, from the tokens', () => {
  it('a pin is navy with a white edge', () => {
    const el = document.createElement('div')
    stylePin(el)
    expect(el.style.background).toBe('var(--color-pin)')
    expect(el.dataset.selected).toBe('false')
  })

  it('the selected pin is gold, ringed and larger: never colour alone', () => {
    const el = document.createElement('div')
    stylePin(el, { selected: true })
    expect(el.style.background).toBe('var(--color-pin-selected)')
    expect(el.style.border).toContain('var(--color-pin-selected-ring)')
    expect(el.style.width).toBe('calc(var(--pin-size) + var(--pin-grow))')
    expect(el.dataset.selected).toBe('true')
  })

  it('a cluster is navy with its count', () => {
    const el = document.createElement('div')
    styleCluster(el, 12)
    expect(el.style.background).toBe('var(--color-cluster)')
    expect(el.textContent).toBe('12')
  })
})

// #475 — PM, 2026-10-07 (option A): an exact address is a teardrop pin, an area
// is a soft translucent disc with a count, and the two read as different things.
describe('#475 — teardrop pin and area disc', () => {
  const make = (fn: (el: HTMLElement) => void) => {
    const el = document.createElement('div')
    fn(el)
    return el
  }

  it('an exact address is a teardrop: taller than wide, drawn as a path, navy', () => {
    const el = make((e) => styleTeardrop(e))
    expect(el.dataset.shape).toBe('teardrop')
    expect(el.querySelector('svg path')).not.toBeNull()
    expect(el.querySelector('svg')!.getAttribute('fill')).toBe('var(--color-pin)')
    // Height is 4/3 of the width: head over a tapering point.
    expect(el.style.height).toBe('calc(var(--pin-size) * 4 / 3)')
  })

  it('the selected teardrop is gold, ringed and larger: never colour alone', () => {
    const el = make((e) => styleTeardrop(e, { selected: true }))
    const svg = el.querySelector('svg')!
    expect(svg.getAttribute('fill')).toBe('var(--color-pin-selected)')
    expect(el.querySelector('svg path')!.getAttribute('stroke')).toBe('var(--color-pin-selected-ring)')
    expect(el.dataset.selected).toBe('true')
  })

  it('an area is a translucent disc with its count: no point, no tail, no edge', () => {
    const el = make((e) => styleAreaMarker(e, 5))
    expect(el.dataset.shape).toBe('area')
    expect(el.textContent).toBe('5')
    expect(el.style.borderRadius).toBe('50%')
    expect(el.querySelector('svg')).toBeNull()
    expect(el.style.background).toContain('var(--color-area)')
    expect(el.style.background).toContain('transparent')
    expect(el.style.border).toBe('')
  })

  it('the three markers differ in shape and fill, so none can be mistaken for another', () => {
    const pin = make((e) => styleTeardrop(e))
    const area = make((e) => styleAreaMarker(e, 3))
    const cluster = make((e) => styleCluster(e, 3))
    expect(new Set([pin.dataset.shape, area.dataset.shape, cluster.dataset.shape]).size).toBe(3)
    // Cluster: opaque navy with a white edge. Area: translucent, edgeless.
    expect(cluster.style.background).toBe('var(--color-cluster)')
    expect(cluster.style.border).toContain('var(--color-pin-edge)')
    expect(area.style.background).not.toContain('var(--color-cluster)')
    expect(area.style.border).not.toContain('solid')
  })
})
