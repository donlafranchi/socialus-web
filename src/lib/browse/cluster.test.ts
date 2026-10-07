import { describe, it, expect } from 'vitest'
import { gridCluster } from './cluster'

describe('#331 — pins close together cluster', () => {
  it('groups points in the same cell and leaves distant ones alone', () => {
    const c = gridCluster([
      { key: 'a', x: 10, y: 10 },
      { key: 'b', x: 30, y: 40 },
      { key: 'c', x: 300, y: 300 },
    ])
    expect(c.map((x) => x.keys.sort())).toEqual([['a', 'b'], ['c']])
  })
})
