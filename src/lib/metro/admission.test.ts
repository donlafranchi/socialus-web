// F081 ruling 2026-11-25 (the PM): within an hour of one open market, admitted; of several, choose; of none, the waitlist.
import { describe, it, expect } from 'vitest'
import { admitVisitor, milesBetween, ADMIT_REACH_MILES } from './admission'
import type { FeedMetro } from '@/lib/feed/feed-metro'

const SAC: FeedMetro = { id: 'sac', slug: 'sacramento-roseville-ca', name: 'Sacramento-Roseville, CA', isOpen: true, center: [-121.4944, 38.5816] }
const SF: FeedMetro = { id: 'sf', slug: 'san-jose-san-francisco-oakland-ca', name: 'San Jose-San Francisco-Oakland, CA', isOpen: true, center: [-122.2711, 37.8044] }
const RENO_WAITING: FeedMetro = { id: 'reno', slug: 'reno-carson-city-nv', name: 'Reno-Carson City, NV', isOpen: false, center: [-119.8138, 39.5296] }
const NO_CENTRE: FeedMetro = { id: 'x', slug: 'x', name: 'X', isOpen: true }

const DAVIS: [number, number] = [-121.7405, 38.5449] // ~14 mi from Sacramento's centre
const VALLEJO: [number, number] = [-122.2566, 38.1041] // ~25 mi from Oakland, ~50 from Sacramento
const VACAVILLE: [number, number] = [-121.9877, 38.3566] // ~31 mi from Sacramento, ~41 from Oakland
const RENO: [number, number] = [-119.8138, 39.5296]
const NEW_YORK: [number, number] = [-74.006, 40.7128]

describe('admitVisitor', () => {
  it('measures miles as the crow flies', () => {
    expect(milesBetween(DAVIS, SAC.center!)).toBeGreaterThan(10)
    expect(milesBetween(DAVIS, SAC.center!)).toBeLessThan(20)
    expect(milesBetween(NEW_YORK, SAC.center!)).toBeGreaterThan(2000)
  })

  it('no location to go on is unknown, never a guess', () => {
    expect(admitVisitor(null, [SAC, SF])).toEqual({ kind: 'unknown' })
  })

  it('within an hour of one open market admits them to it', () => {
    expect(admitVisitor(DAVIS, [SAC, SF])).toEqual({ kind: 'one', metro: SAC })
  })

  it('inside a market’s boundary admits them, however far its centre', () => {
    const farInside: [number, number] = [-120.0, 39.2]
    expect(milesBetween(farInside, SAC.center!)).toBeGreaterThan(ADMIT_REACH_MILES)
    expect(admitVisitor(farInside, [SAC], 'sac')).toEqual({ kind: 'one', metro: SAC })
  })

  it('within an hour of several open markets, they choose from those, nearest first', () => {
    expect(admitVisitor(VACAVILLE, [SF, SAC])).toEqual({ kind: 'several', metros: [SAC, SF] })
  })

  it('beyond an hour of every open market is far (the waitlist)', () => {
    expect(admitVisitor(NEW_YORK, [SAC, SF])).toEqual({ kind: 'far' })
    expect(admitVisitor(VALLEJO, [SAC])).toEqual({ kind: 'far' })
  })

  it('a market that is not open never admits, even next door', () => {
    expect(admitVisitor(RENO, [SAC, RENO_WAITING])).toEqual({ kind: 'far' })
  })

  it('an open market with no centre admits only from inside its boundary', () => {
    expect(admitVisitor(DAVIS, [NO_CENTRE])).toEqual({ kind: 'far' })
    expect(admitVisitor(DAVIS, [NO_CENTRE], 'x')).toEqual({ kind: 'one', metro: NO_CENTRE })
  })
})
