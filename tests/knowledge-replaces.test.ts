import { describe, it, expect } from 'vitest'
import { replacesTagNames, replacesTagQuotesRedated } from '../scripts/knowledge/import'

// #1282: a ruling gone from socialus-plan retires against the newer ruling
// whose `[replaces …]` names it, by the old ruling's date or by the scenario
// it sat in (socialus-ops process/ABSOLUTES.md § newer-decision-wins).

const gone = {
  decided_on: '2026-09-30',
  source: 'planning/scenario-F093.md:66',
  answer: 'Signed-out visitors see no map pins. A Page\'s stored location is used only for metro scoping when signed out.',
}

describe('which ruling a [replaces …] tag names', () => {
  it('names it by date, with its words or a clause of them', () => {
    expect(replacesTagNames('[replaces 2026-09-30: Signed-out visitors see no map pins.]', gone)).toBe(true)
    expect(replacesTagNames('[replaces 2026-10-01: Signed-out visitors see no map pins.]', gone)).toBe(false)
  })

  it('names it by the scenario it sat in, with its words or a clause of them', () => {
    expect(replacesTagNames('[replaces F093: Signed-out visitors see no map pins.]', gone)).toBe(true)
    expect(replacesTagNames(`[replaces F093: ${gone.answer}]`, gone)).toBe(true)
    // Another scenario's file, or F0930's, is not this one.
    expect(replacesTagNames('[replaces F091: Signed-out visitors see no map pins.]', gone)).toBe(false)
    expect(replacesTagNames('[replaces F0930: Signed-out visitors see no map pins.]', { ...gone, source: 'planning/scenario-F093.md:66' })).toBe(false)
    expect(replacesTagNames('[replaces F093: Signed-out visitors see the map.]', gone)).toBe(false)
    expect(replacesTagNames('[replaces F093: Signed-out visitors see no map pins.]', { ...gone, source: null })).toBe(false)
  })

  it('a path or none names no ruling', () => {
    expect(replacesTagNames('[replaces planning/scenario-F093.md]', gone)).toBe(false)
    expect(replacesTagNames('[replaces none]', gone)).toBe(false)
  })
})

// The Knowledge import dry run of 2026-11-24 (run 59) refused to write: two
// rulings replaced in socialus-plan on 2026-11-24 stayed live in the store,
// because their tags quote the old line as it stood in the file, date first
// (`[replaces 2026-10-06: 2026-10-06 — Location …]`). socialus-plan's
// markers.py accepts that form (it looks for the text in the old file), so the
// import must too.
describe('a replaces tag that quotes the old line with its date', () => {
  const gone = {
    decided_on: '2026-10-06',
    source: 'product/systems/location.md:39',
    answer: 'Location ("venue") pages are currently retired, and their address `/p/<place>/l/<slug>` is deleted. A post at an address with no Page shows the address and a map pin.',
  }
  it('names the ruling when the quoted text opens with the same date', () => {
    expect(replacesTagNames('[replaces 2026-10-06: 2026-10-06 — Location ("venue") pages are currently retired, and their address]', gone)).toBe(true)
  })
  it('still refuses a different date, in the tag or in the quoted text, and different words', () => {
    expect(replacesTagNames('[replaces 2026-10-07: 2026-10-07 — Location ("venue") pages are currently retired, and their address]', gone)).toBe(false)
    expect(replacesTagNames('[replaces 2026-10-06: 2026-10-07 — Location ("venue") pages are currently retired, and their address]', gone)).toBe(false)
    expect(replacesTagNames('[replaces 2026-10-06: 2026-10-06 — Venue pages are back]', gone)).toBe(false)
  })
})

// D-0294: ruled 2026-11-01, re-dated 2026-11-13 and replaced 2026-11-24 with no
// import in between, so the store holds the first dating and the only tag
// left names the second.
describe('a replaces tag that quotes a ruling re-dated since the last import', () => {
  const gone = {
    decided_on: '2026-11-01',
    answer: "Explore puts the timely first and mixes locals tips in with Pages' posts: a post's kind (event, sale, limited) decides its shelf, timely on top. A locals tip is a recommendation or a happening, never a review.",
  }
  // The later dating was reworded at its end, as the real one was.
  const tag = "[replaces 2026-11-13: 2026-11-13 — Explore puts the timely first and mixes locals tips in with Pages' posts: a post's kind (event, sale, limited) decides its shelf, timely on top. A locals tip is a review under another name, called a tip.]"
  it('is not named by date, and is found by its opening words under the later date', () => {
    expect(replacesTagNames(tag, { ...gone, source: 'product/systems/discovery.md:37' })).toBe(false)
    expect(replacesTagQuotesRedated(tag, gone)).toBe(true)
  })
  it('refuses an earlier or equal date, other words, a short shared opening, and a tag that does not quote a dated line', () => {
    expect(replacesTagQuotesRedated(tag, { ...gone, decided_on: '2026-11-13' })).toBe(false)
    expect(replacesTagQuotesRedated(tag, { ...gone, decided_on: '2026-11-20' })).toBe(false)
    expect(replacesTagQuotesRedated(tag, { ...gone, answer: 'Explore is a list with a map only in answers.' })).toBe(false)
    expect(replacesTagQuotesRedated('[replaces 2026-11-13: 2026-11-13 — Explore puts the timely]', gone)).toBe(false)
    expect(replacesTagQuotesRedated("[replaces 2026-11-13: Explore puts the timely first and mixes locals tips in with Pages' posts]", gone)).toBe(false)
    expect(replacesTagQuotesRedated("[replaces 2026-11-13: 2026-11-14 — Explore puts the timely first and mixes locals tips in with Pages' posts]", gone)).toBe(false)
  })
})

// #1445: when the store's constraints file differs from socialus-plan's, the
// run says where, so the next failure does not need the database to explain.
describe('what a failed comparison reports', () => {
  it('names the lines each side has alone, and says so when only the order differs', async () => {
    const { firstDifferences } = await import('../scripts/knowledge/export')
    expect(firstDifferences('a\nb\nc', 'a\nc\nd')).toEqual(['only in the store: b', 'only in socialus-plan: d'])
    expect(firstDifferences('a\nb', 'b\na')).toEqual(['the same lines in a different order'])
  })
})
