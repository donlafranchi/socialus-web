import { describe, it, expect } from 'vitest'
import { holdSaturated, TOWN_SATURATION } from './saturation'

describe('#987 the seeder steps back from a town that runs itself', () => {
  it('holds only new Pages in a full town', () => {
    const a = { city: 'Davis', publicInfoUrl: 'https://a.com' }
    const b = { city: 'Davis', publicInfoUrl: 'https://b.com' }
    const c = { city: 'Folsom', publicInfoUrl: 'https://c.com' }
    const d = { city: 'Davis', publicInfoUrl: 'https://d-new.com', legacyUrl: 'https://d.com' }
    const r = holdSaturated([a, b, c, d], new Set(['Davis']), new Set(['https://a.com', 'https://d.com']))
    expect(r.load).toEqual([a, c, d])
    expect(r.held).toEqual([b])
  })

  it('the threshold is 5 claimed Pages posting within 30 days', () => {
    expect(TOWN_SATURATION).toEqual({ claimedPages: 5, withinDays: 30 })
  })
})
