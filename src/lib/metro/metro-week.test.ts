// F093 criterion 5 — the period the count is over.
//
// Pinned to real instants rather than derived from the implementation. The
// whole point of the metro zone is that it is NOT the reader's, so a test that
// computes the expected answer the same way the code does would agree with a
// bug. `vitest.config.ts` pins TZ=UTC for exactly this reason (#211).

import { describe, it, expect } from 'vitest'
import { metroWeekBounds, METRO_WEEK_LABEL } from './metro-week'

describe('metroWeekBounds', () => {
  it('starts on Monday at midnight in the metro, not in UTC', () => {
    // Wednesday 2026-09-23 09:00 in Sacramento (PDT, UTC-7).
    const { from } = metroWeekBounds(new Date('2026-09-23T16:00:00.000Z'))
    // Monday 2026-09-21 00:00 PDT is 07:00 UTC. A UTC-derived week would say
    // 2026-09-21T00:00:00.000Z and be seven hours early.
    expect(from).toBe('2026-09-21T07:00:00.000Z')
  })

  it('ends on the following Monday, so the week is exactly seven days', () => {
    const { to } = metroWeekBounds(new Date('2026-09-23T16:00:00.000Z'))
    expect(to).toBe('2026-09-28T07:00:00.000Z')
  })

  it('treats Sunday as the last day of the week, not the first', () => {
    // Sunday 2026-09-27 12:00 PDT. ISO weeks run Monday–Sunday, which is the
    // convention browse's own filters already use (weekRange).
    const { from } = metroWeekBounds(new Date('2026-09-27T19:00:00.000Z'))
    expect(from).toBe('2026-09-21T07:00:00.000Z')
  })

  it('starts the new week on Monday itself', () => {
    // Monday 2026-09-28 00:30 PDT — half an hour into the new week.
    const { from } = metroWeekBounds(new Date('2026-09-28T07:30:00.000Z'))
    expect(from).toBe('2026-09-28T07:00:00.000Z')
  })

  it('names the period in words a reader understands', () => {
    // Criterion 5: "the period is named on the card in words a reader
    // understands. A count that cannot be read as a period is not a count."
    expect(METRO_WEEK_LABEL).toBe('this week')
  })
})
