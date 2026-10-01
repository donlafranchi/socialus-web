import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generate } from '../scripts/seed-personas'
import { PERSONAS, PAGES } from '../evals/personas'

// #269 — the persona seed is generated from evals/personas.ts. A hand edit to
// either one, or a forgotten --generate, fails here rather than in a browser.
describe('the persona seed', () => {
  it('matches evals/personas.ts', () => {
    expect(readFileSync(resolve(__dirname, '../supabase/seeds/personas.sql'), 'utf8')).toBe(generate())
  })

  it('covers every role and every Page kind', () => {
    expect(PERSONAS.map((p) => p.key)).toEqual(
      expect.arrayContaining(['signedOut', 'stranger', 'follower', 'member', 'applicant', 'rsvp', 'operator']),
    )
    expect(new Set(PAGES.map((p) => p.kind))).toEqual(
      new Set(['business', 'place', 'interest', 'practice', 'event_anchored', 'family']),
    )
    for (const pg of PAGES) expect(PERSONAS.some((p) => p.owns === pg.key), pg.key).toBe(true)
  })

  it('is only ever applied to a local database', () => {
    const src = readFileSync(resolve(__dirname, '../scripts/seed-personas.ts'), 'utf8')
    expect(src).toMatch(/REFUSING/)
    expect(src).toMatch(/LOCAL = new Set\(\['localhost', '127\.0\.0\.1', '::1'/)
  })
})
