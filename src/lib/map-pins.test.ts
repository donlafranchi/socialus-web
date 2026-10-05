import { describe, it, expect } from 'vitest'
import { stylePin, styleCluster } from './map-pins'

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
