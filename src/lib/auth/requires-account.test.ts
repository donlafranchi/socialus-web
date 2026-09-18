// Signed out is read-only (2026-09-18).
//
// The assertion that matters most is the first one: the gated list is the whole
// list. A control added later that forgets to gate is the failure mode, and a
// list nothing checks is how that happens quietly.

import { describe, it, expect } from 'vitest'
import {
  GATED_ACTIONS,
  promptFor,
  signInHref,
  parseIntent,
  type GatedAction,
} from './requires-account'

describe('everything that touches another person is gated', () => {
  it('names follow, get-updates, support, report, respond and message', () => {
    expect([...GATED_ACTIONS].sort()).toEqual(
      ['follow', 'get-updates', 'message', 'report', 'respond', 'support'].sort(),
    )
  })

  // Reporting sits INSIDE the wall. Requiring an account buys continuity, not
  // identity: an account is persistent, rate-limitable and revocable.
  it('includes reporting', () => {
    expect(GATED_ACTIONS).toContain('report')
  })

  it('gives every action a prompt that says what the account is for', () => {
    for (const a of GATED_ACTIONS) {
      const p = promptFor(a)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.why.length).toBeGreaterThan(0)
      // "For security" is a non-answer, and so is anything about verifying you.
      expect(p.why).not.toMatch(/for security|verif/i)
    }
  })

  it("says plainly that reporting is not an identity check", () => {
    expect(promptFor('report').why).toMatch(/not an identity check/i)
  })
})

describe('deferred registration — the tap is not lost', () => {
  it('carries both the path and the intent through sign-in', () => {
    const href = signInHref('support', '/p/oak-park-bakery')
    expect(href).toContain('/auth/login?next=')
    const next = decodeURIComponent(href.split('next=')[1])
    expect(next).toBe('/p/oak-park-bakery?intent=support')
  })

  it('appends to a path that already has a query', () => {
    const next = decodeURIComponent(signInHref('follow', '/explore?metro=x').split('next=')[1])
    expect(next).toBe('/explore?metro=x&intent=follow')
  })

  it('reads a known intent back', () => {
    for (const a of GATED_ACTIONS) expect(parseIntent(a)).toBe(a)
  })

  // An intent is a string from a URL. It decides what runs after sign-in, so
  // anything not on the list is nothing.
  it('ignores an intent that is not a gated action', () => {
    for (const bad of ['delete', '../admin', '', null, undefined, 'FOLLOW']) {
      expect(parseIntent(bad as string | null)).toBeNull()
    }
  })
})

describe('what it deliberately is not', () => {
  // The report prompt says "It is not an identity check", which is the
  // opposite of claiming one — so the banned list is affirmative terms only.
  // The negated phrasing is asserted above, deliberately.
  it('makes no affirmative verification or identity claim anywhere in the copy', () => {
    const all = GATED_ACTIONS.map((a: GatedAction) => `${promptFor(a).title} ${promptFor(a).why}`).join(' ')
    expect(all).not.toMatch(/\b(verify|verified|verification|real name|legal name|prove who)\b/i)
  })
})
