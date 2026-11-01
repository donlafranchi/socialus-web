import { describe, it, expect } from 'vitest'
import { emptyTrail, tapBack, tapForward, popped, moved } from './history-trail'

describe('history trail (#1141)', () => {
  it('starts with nowhere to go forward', () => {
    expect(emptyTrail.forward).toBe(0)
    expect(tapForward(emptyTrail)).toEqual(emptyTrail)
  })

  it('Back opens Forward by one', () => {
    expect(popped(tapBack(emptyTrail)).forward).toBe(1)
    expect(popped(tapBack(popped(tapBack(emptyTrail)))).forward).toBe(2)
  })

  it('Forward uses one up and never goes below zero', () => {
    const afterBack = popped(tapBack(emptyTrail))
    expect(popped(tapForward(afterBack)).forward).toBe(0)
    expect(popped({ forward: 0, pending: 'forward' }).forward).toBe(0)
  })

  it('a history move we did not make leaves the count alone', () => {
    const t = popped(tapBack(emptyTrail))
    expect(popped(t)).toEqual(t)
  })

  it('a fresh move (a link, a search) ends the trail; a history move does not', () => {
    const t = popped(tapBack(emptyTrail))
    expect(moved(t, false)).toEqual(emptyTrail)
    expect(moved(t, true)).toEqual(t)
  })
})
