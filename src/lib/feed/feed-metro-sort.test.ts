// F076 — most wanted first. Don: "it would be cool to sort those metros by
// number of people signed up."
//
// The ordering reads the SAME cached figure the popup shows. A live count here
// would be a particularly good oracle — a sorted list exposes every metro at
// once, so a probe would not even need to know which one to watch.

import { describe, it, expect } from 'vitest'
import { splitByOpen, withWaitingCounts, type FeedMetro } from './feed-metro'

const metro = (slug: string, over: Partial<FeedMetro> = {}): FeedMetro => ({
  id: `id-${slug}`,
  slug,
  name: slug.toUpperCase(),
  isOpen: false,
  ...over,
})

describe('withWaitingCounts', () => {
  it('merges the cached figure onto the metros it names', () => {
    const merged = withWaitingCounts(
      [metro('boise'), metro('reno')],
      new Map([['id-boise', 12]]),
    )
    expect(merged.find((m) => m.slug === 'boise')!.waiting).toBe(12)
    // Absent from the snapshot stays UNDEFINED, not 0.
    expect(merged.find((m) => m.slug === 'reno')!.waiting).toBeUndefined()
  })

  it('leaves the metros alone when the snapshot is empty', () => {
    const input = [metro('boise')]
    expect(withWaitingCounts(input, new Map())).toEqual(input)
  })
})

describe('splitByOpen — most wanted first', () => {
  it('orders the not-yet group by waiting count, descending', () => {
    const { notYet } = splitByOpen([
      metro('reno', { waiting: 3 }),
      metro('boise', { waiting: 40 }),
      metro('bend', { waiting: 12 }),
    ])
    expect(notYet.map((m) => m.slug)).toEqual(['boise', 'bend', 'reno'])
  })

  it('breaks ties alphabetically, so nothing shuffles between refreshes', () => {
    const { notYet } = splitByOpen([
      metro('zeta', { waiting: 5 }),
      metro('alpha', { waiting: 5 }),
    ])
    expect(notYet.map((m) => m.slug)).toEqual(['alpha', 'zeta'])
  })

  it('sorts an unknown count below a genuine zero', () => {
    // "We do not know" is not "nobody", and a metro we have no figure for must
    // not outrank one we know is empty.
    const { notYet } = splitByOpen([metro('unknown'), metro('empty', { waiting: 0 })])
    expect(notYet.map((m) => m.slug)).toEqual(['empty', 'unknown'])
  })

  it('does not reorder the open group', () => {
    const { open } = splitByOpen([
      metro('sac', { isOpen: true, waiting: 1 }),
      metro('other', { isOpen: true, waiting: 900 }),
    ])
    // An open metro has no waitlist to sort by, and the served list is what
    // a person came for — it keeps the order it arrived in.
    expect(open.map((m) => m.slug)).toEqual(['sac', 'other'])
  })

  it('does not mutate its input', () => {
    const input = [metro('reno', { waiting: 3 }), metro('boise', { waiting: 40 })]
    splitByOpen(input)
    expect(input.map((m) => m.slug)).toEqual(['reno', 'boise'])
  })
})
