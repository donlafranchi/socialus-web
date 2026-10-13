import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COMBINED_TARGET,
  metroStanding,
  standingMessage,
} from './waitlist-standing'

// T163 (#77) — what the popup shows, and what it must never say.
//
// The split is how the platform decides; 300 is what the person reads
// (F076 criteria 8 and 10).

const M = (creators: number, patrons: number, creatorThreshold = 50, patronThreshold = 250) => ({
  creatorCount: creators,
  patronCount: patrons,
  creatorThreshold,
  patronThreshold,
})

describe('the combined number (c8)', () => {
  it('is the sum of the two stored counts', () => {
    expect(metroStanding(M(10, 40)).combined).toBe(50)
  })

  it('is measured against 300', () => {
    expect(COMBINED_TARGET).toBe(300)
    expect(metroStanding(M(50, 250)).target).toBe(300)
  })

  it('never exposes the split to the caller as a display value', () => {
    // The standing carries the raw counts because criterion 6 requires them
    // readable — but `display` is what the popup renders, and it is one number.
    const s = metroStanding(M(50, 250))
    expect(s.display).toEqual({ combined: 300, target: 300 })
  })
})

describe('eligibility is gated on creators (c10)', () => {
  // [guards F076.10]
  it('needs at least 50 creators AND at least 250 patrons, and nothing else makes a metro eligible', () => {
    const cases: Array<[number, number, boolean]> = [
      [50, 250, true],
      [49, 250, false],
      [50, 249, false],
      [49, 251, false],
      [0, 300, false],
      [300, 0, false],
      [80, 400, true],
    ]
    for (const [creators, patrons, eligible] of cases) {
      expect(metroStanding(M(creators, patrons)).eligible, `${creators} creators, ${patrons} patrons`).toBe(eligible)
    }
  })

  it('is false at 299 combined', () => {
    expect(metroStanding(M(49, 250)).eligible).toBe(false)
  })

  it('is false at 300 combined with 49 creators', () => {
    // The scenario's own worked example, and the whole reason for the split:
    // a combined-only gate opens a metro with nothing in it.
    expect(metroStanding(M(49, 251)).combined).toBe(300)
    expect(metroStanding(M(49, 251)).eligible).toBe(false)
  })

  it('is false at 300 combined with 5 creators and 295 patrons', () => {
    expect(metroStanding(M(5, 295)).eligible).toBe(false)
  })

  it('is true at exactly 50 creators and 250 patrons', () => {
    expect(metroStanding(M(50, 250)).eligible).toBe(true)
  })

  it('is true beyond the thresholds', () => {
    expect(metroStanding(M(80, 400)).eligible).toBe(true)
  })

  it('is false with enough creators but too few patrons', () => {
    expect(metroStanding(M(50, 249)).eligible).toBe(false)
  })

  // [guards F076.11]
  it('honours per-metro thresholds rather than the constants (c11), which live as columns, so changing one needs no migration or deploy', () => {
    expect(metroStanding(M(10, 20, 10, 20)).eligible).toBe(true)
    expect(metroStanding(M(10, 20)).eligible).toBe(false)
    expect(metroStanding(M(60, 20, 70, 20)).eligible).toBe(false)
    // No threshold is baked into the code that decides eligibility...
    const src = readFileSync(resolve(__dirname, 'waitlist-standing.ts'), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
    expect(src).not.toMatch(/\b(50|250)\b/)
    // ...they are per-row columns with defaults, so the data carries them.
    const mig = readFileSync(resolve(__dirname, '../../../supabase/migrations/20260914204920_metro_waitlist.sql'), 'utf8')
    expect(mig).toMatch(/creator_threshold\s+int(eger)?\s+not null\s+default\s+50/i)
    expect(mig).toMatch(/patron_threshold\s+int(eger)?\s+not null\s+default\s+250/i)
  })
})

describe('the message (c9) — what is needed, never when', () => {
  const messages = [
    standingMessage(metroStanding(M(0, 0))),
    standingMessage(metroStanding(M(49, 251))),
    standingMessage(metroStanding(M(50, 250))),
    standingMessage(metroStanding(M(300, 300))),
  ]

  it('says what is still needed', () => {
    expect(standingMessage(metroStanding(M(10, 40)))).toMatch(/need|more|before/i)
  })

  // [guards F076.9]
  it('never states or implies a date or a timeline', () => {
    // A hard constraint, not copy guidance. Scanned across every state the
    // popup can be in, so a message added for one state cannot slip a promise
    // in through the back door.
    const forbidden = [
      'soon', 'shortly', 'coming', 'launch', 'week', 'month', 'year', 'day',
      'date', 'timeline', 'eta', 'estimate', 'expect', 'when we', 'q1', 'q2',
      'q3', 'q4', 'next', 'by the end',
    ]
    for (const m of messages) {
      for (const word of forbidden) {
        expect(m.toLowerCase(), `"${m}" must not contain "${word}"`).not.toContain(word)
      }
      expect(m.toLowerCase()).not.toMatch(/\bwill open\b|\bwill be\b|\bguarantee\b|\bpromise\b/)
    }
    // And it states what is still needed while something is.
    expect(messages[0]).toMatch(/need|more|before/i)
  })

  it('never promises that the metro will open', () => {
    for (const m of messages) {
      expect(m.toLowerCase()).not.toMatch(/\bwill open\b|\bwill be\b|\bguarantee\b|\bpromise\b/)
    }
  })

  it('does not reveal the creator/patron split', () => {
    for (const m of messages) {
      expect(m.toLowerCase()).not.toContain('creator')
      expect(m.toLowerCase()).not.toContain('patron')
      expect(m).not.toContain('50')
      expect(m).not.toContain('250')
    }
  })

  it('says something honest once the thresholds are met, without opening anything', () => {
    const m = standingMessage(metroStanding(M(50, 250)))
    expect(m.length).toBeGreaterThan(0)
    expect(m.toLowerCase()).not.toMatch(/\bopen(ing|ed|s)?\b.*\b(now|today)\b/)
  })
})
