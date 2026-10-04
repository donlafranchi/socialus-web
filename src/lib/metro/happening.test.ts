import { describe, it, expect } from 'vitest'
import { happeningWindows } from './happening'

// F091 — the rows under "What's happening…": today, this week, this weekend.
// Windows are the metro's, bound to the hour: today is now to the end of the
// day, not a calendar day already half gone (criterion 2).

const iso = (s: string) => new Date(s).toISOString()

describe('happeningWindows', () => {
  // [guards F091.2]
  it("a Thursday afternoon: today runs from now to midnight in Sacramento, not from this morning", () => {
    const now = new Date('2026-10-01T23:00:00Z') // Thu 4pm PDT
    const w = happeningWindows(now)
    expect(w.today).toEqual({ from: iso('2026-10-01T23:00:00Z'), to: iso('2026-10-02T07:00:00Z') })
    expect(w.thisWeek).toEqual({ from: iso('2026-10-01T23:00:00Z'), to: iso('2026-10-05T07:00:00Z') })
    expect(w.thisWeekend).toEqual({ from: iso('2026-10-03T07:00:00Z'), to: iso('2026-10-05T07:00:00Z') })
  })

  it('inside the weekend, the weekend starts now', () => {
    const now = new Date('2026-10-03T17:00:00Z') // Sat 10am PDT
    expect(happeningWindows(now).thisWeekend.from).toBe(iso('2026-10-03T17:00:00Z'))
  })

  it("a Sunday night: every row ends at Monday's midnight", () => {
    const now = new Date('2026-10-05T06:00:00Z') // Sun 11pm PDT
    const w = happeningWindows(now)
    for (const r of [w.today, w.thisWeek, w.thisWeekend]) expect(r).toEqual({ from: iso(now.toISOString()), to: iso('2026-10-05T07:00:00Z') })
  })

  it('keeps local midnight across the end of daylight saving', () => {
    const now = new Date('2026-10-31T19:00:00Z') // Sat Oct 31, noon PDT; DST ends Sun Nov 1
    expect(happeningWindows(now).thisWeekend.to).toBe(iso('2026-11-02T08:00:00Z')) // Mon 00:00 PST
  })
})
