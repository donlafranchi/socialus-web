import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  canonicalPagePath,
  isPageId,
} from './page-handle'

// Issue #175 — a Page a member created has no reachable URL.
//
// The ruling (ops-pattern planning/URL-IDENTITY.md, 2026-09-21): no geography
// in the address and nothing in it derived from a member. #411 (the PM,
// 2026-10-06; socialus-plan planning/research/url-plan-2026-10-06.md): the
// only Page address is the id alone, /g/<id>. Older forms are not forwarded
// while there are no members to protect; they are not found.

describe('the canonical Page address', () => {
  it('is the id alone, so a rename cannot move it', () => {
    expect(canonicalPagePath('7k3x8m')).toBe('/g/7k3x8m')
  })

  it('carries no place path — a metro today, a neighbourhood later, and the address survives both', () => {
    const path = canonicalPagePath('q4vw2n')
    expect(path).not.toMatch(/\/(ca|sacramento|p)\//)
    expect(path.split('/').filter(Boolean)).toHaveLength(2)
  })
})

describe('what resolves a Page', () => {
  it('is the id, exactly as minted', () => {
    expect(isPageId('7k3x8m')).toBe(true)
  })

  it('is nothing else: no slug, no capitals, no look-alikes, no other length (#411)', () => {
    for (const h of ['joes-pizza-7k3x8m', 'joes-pizza', '7K3X8M', '7k3x8l', '7k3x8', '7k3x8m9', '', '   ']) {
      expect(isPageId(h)).toBe(false)
    }
  })
})

describe('the id alphabet', () => {
  it('has an alphabet of exactly 32 distinct characters, minus i, l, o and u', () => {
    expect(PUBLIC_ID_ALPHABET).toHaveLength(32)
    expect(new Set(PUBLIC_ID_ALPHABET).size).toBe(32)
    for (const ch of 'ilou') expect(PUBLIC_ID_ALPHABET).not.toContain(ch)
  })

  it('is six characters — four collides inside one metro', () => {
    expect(PUBLIC_ID_LENGTH).toBe(6)
  })
})

describe('the generator in SQL and the alphabet in TypeScript', () => {
  // Two copies of an alphabet is how they drift. The migration is the only
  // place an id is minted; this is the only place one is read.
  const MIG = resolve(__dirname, '..', '..', '..', 'supabase', 'migrations')
  const file = readdirSync(MIG).find((f) => f.endsWith('_page_public_id.sql'))

  it('ships the migration that mints the ids', () => {
    expect(file).toBeDefined()
  })

  it('mints from the same 32 characters in the same order', () => {
    const sql = readFileSync(resolve(MIG, file!), 'utf8')
    expect(sql).toContain(PUBLIC_ID_ALPHABET)
  })

  it('never derives an id from a member, a group, a timestamp or a sequence', () => {
    const sql = readFileSync(resolve(MIG, file!), 'utf8')
    expect(sql).toContain('gen_random_bytes')
    // Comments and quoted prose stripped: the migration explains at length
    // what it refuses to derive from, and matching that explanation would
    // fail the file for saying so. What is checked is the executable half.
    const code = sql.replace(/^\s*--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''")
    expect(code).not.toMatch(/\bsequence\b|\bserial\b|nextval|clock_timestamp|founder_member_id|\bid\b\s*::\s*text/)
  })
})
