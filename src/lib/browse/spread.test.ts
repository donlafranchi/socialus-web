// #475 — pins at one address are spread apart so each can be tapped.

import { describe, it, expect } from 'vitest'
import { spreadCoincident } from './spread'

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('spreadCoincident', () => {
  it('leaves a lone pin exactly where it is', () => {
    expect(spreadCoincident([{ key: 'a', x: 10, y: 20 }])).toEqual([{ key: 'a', x: 10, y: 20 }])
  })

  it('moves pins on the same spot apart, every pair at least a pin-width from the other', () => {
    const out = spreadCoincident([
      { key: 'a', x: 100, y: 100 },
      { key: 'b', x: 100, y: 100 },
      { key: 'c', x: 100.4, y: 100 },
    ])
    for (const [i, p] of out.entries()) for (const q of out.slice(i + 1)) expect(dist(p, q)).toBeGreaterThanOrEqual(20)
  })

  it('keeps the group centred on the address', () => {
    const out = spreadCoincident([{ key: 'a', x: 50, y: 50 }, { key: 'b', x: 50, y: 50 }, { key: 'c', x: 50, y: 50 }])
    expect(out.reduce((s, p) => s + p.x, 0) / 3).toBeCloseTo(50)
    expect(out.reduce((s, p) => s + p.y, 0) / 3).toBeCloseTo(50)
  })

  it('does not touch pins that are already apart, and keeps order and keys', () => {
    const input = [{ key: 'a', x: 0, y: 0 }, { key: 'b', x: 80, y: 0 }]
    expect(spreadCoincident(input)).toEqual(input)
  })
})
