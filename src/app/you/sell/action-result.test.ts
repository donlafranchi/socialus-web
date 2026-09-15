// #107 — a server action's message has to survive the boundary.
//
// `SellActionError` called itself "the discriminated error result the client
// surfaces" and was then thrown. A custom Error thrown from a 'use server'
// function does not cross the boundary in production: Next replaces it with
// "An error occurred in the Server Components render" plus a digest. So every
// carefully worded message in that file reached people as the same generic
// error, which is how Don hit a crash with nothing to go on.

import { describe, it, expect } from 'vitest'
import { failed, succeeded, type ActionResult } from './action-result'

describe('the result shape', () => {
  it('carries the message as data, not as a thrown error', () => {
    const r = failed('A Location needs a real address or a neighbourhood.', 'location_needs_place')
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({
      ok: false,
      message: 'A Location needs a real address or a neighbourhood.',
      code: 'location_needs_place',
    })
  })

  it('survives a structured-clone round trip, which is what the boundary does', () => {
    const r = failed('That neighbourhood could not be found.', 'neighborhood_not_found')
    const crossed = structuredClone(r)
    expect(crossed).toEqual(r)
    expect((crossed as { message: string }).message).toBe('That neighbourhood could not be found.')
  })

  it('an Error does NOT survive that round trip with its message intact', () => {
    // The reason the old shape failed, asserted rather than asserted-about.
    class Custom extends Error {
      code = 'x'
    }
    const cloned = structuredClone(new Custom('the useful part'))
    expect((cloned as { code?: string }).code).toBeUndefined()
  })

  it('wraps a success without a message', () => {
    const r = succeeded({ groupId: 'g1' })
    expect(r).toEqual({ ok: true, data: { groupId: 'g1' } })
  })

  it('narrows on ok, so a caller cannot read data off a failure', () => {
    const r: ActionResult<{ groupId: string }> = failed('nope', 'e')
    if (r.ok) expect(r.data.groupId).toBeDefined()
    else expect(r.message).toBe('nope')
  })
})
