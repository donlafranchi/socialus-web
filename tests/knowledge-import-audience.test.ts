import { describe, it, expect } from 'vitest'
import { wantedFromRuling } from '../scripts/knowledge/import'
import type { Ruling } from '../scripts/knowledge/plan-source'

// bug #1230 — a ruling that binds the code tier but whose surfaces map to no
// concern (surfaces=method) was filed for operators only, so a build key could
// not read a ruling constraints/code.md hands every build session.

const ruling = (over: Partial<Ruling>): Ruling => ({
  file: 'planning/scenario-F128.md',
  line: 49,
  date: '2026-11-10',
  words: 'Unfinished work merges dark behind flags of our own.',
  rest: 'The PM, for #1227.',
  binds: { tiers: ['planning', 'code'], surfaces: ['method'], buildNone: false },
  holds: 'for now',
  replaces: [],
  anchor: null,
  principle: false,
  listed: true,
  ...over,
})

describe('who reads an imported ruling', () => {
  it('gives a code-tier ruling that names no concern to the building department', () => {
    const w = wantedFromRuling(ruling({}), '2026-11-11').fields
    expect(w.audience).toBe('department')
    expect(w.departments).toEqual(['building'])
    expect(w.concern).toBeNull()
  })

  it('keeps a planning-only ruling that names no concern for operators', () => {
    const w = wantedFromRuling(ruling({ binds: { tiers: ['planning'], surfaces: ['method'], buildNone: false } }), '2026-11-11').fields
    expect(w.audience).toBe('operators')
  })

  it('keeps the departments a mapped surface gives, and philosophies for operators', () => {
    const mapped = wantedFromRuling(ruling({ binds: { tiers: ['code'], surfaces: ['moderation'], buildNone: false } }), '2026-11-11').fields
    expect(mapped.departments).toEqual(['trust-and-safety'])
    const p = wantedFromRuling(ruling({ principle: true }), '2026-11-11').fields
    expect(p.audience).toBe('operators')
  })
})
