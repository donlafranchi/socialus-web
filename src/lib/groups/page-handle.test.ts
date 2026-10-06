import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
  pageHandle,
  canonicalPagePath,
  parsePageHandle,
  isCanonicalHandle,
} from './page-handle'

// Issue #175 — a Page a member created has no reachable URL.
//
// The ruling (ops-pattern planning/URL-IDENTITY.md, 2026-09-21): no geography
// in the address and nothing in it derived from a member. #411 (the PM,
// 2026-10-06; socialus-plan planning/research/url-plan-2026-10-06.md): the
// canonical address is the id alone, /g/<id>; any slug in front of it is an
// older form that redirects.

describe('the canonical Page address', () => {
  it('is the id alone, so a rename cannot move it', () => {
    expect(canonicalPagePath('7k3x8m')).toBe('/g/7k3x8m')
    expect(pageHandle('7k3x8m')).toBe('7k3x8m')
  })

  it('carries no place path — a metro today, a neighbourhood later, and the address survives both', () => {
    const path = canonicalPagePath('q4vw2n')
    expect(path).not.toMatch(/\/(ca|sacramento|p)\//)
    expect(path.split('/').filter(Boolean)).toHaveLength(2)
  })
})

describe('what resolves a Page', () => {
  it('is the id, and the slug is read for display only', () => {
    const a = parsePageHandle('joes-pizza-7k3x8m')
    const b = parsePageHandle('whatever-they-renamed-it-7k3x8m')
    expect(a?.publicId).toBe('7k3x8m')
    expect(b?.publicId).toBe('7k3x8m')
    expect(a?.slug).toBe('joes-pizza')
    expect(b?.slug).toBe('whatever-they-renamed-it')
  })

  it('accepts a slug containing hyphens — only the last segment is the id', () => {
    expect(parsePageHandle('stare-at-the-stars-abc123')).toEqual({
      slug: 'stare-at-the-stars',
      publicId: 'abc123',
    })
  })

  it('refuses a bare slug whose tail is not id-shaped', () => {
    expect(parsePageHandle('joes-pizza')).toBeNull()
    expect(parsePageHandle('sourdough-co')).toBeNull()
  })

  // The one thing syntax cannot decide, said out loud rather than papered
  // over. `bakery` is six characters and every one of them is in the
  // alphabet, so `mayas-bakery` reads as a handle whether it is one or not.
  // No parser can tell; only a lookup can. This is why the route resolves by
  // id and then falls back to the whole handle as a slug, instead of trusting
  // the split.
  it('cannot tell a slug ending in six valid characters from a handle', () => {
    expect(parsePageHandle('mayas-bakery')).toEqual({ slug: 'mayas', publicId: 'bakery' })
  })

  it('refuses an id of the wrong length', () => {
    expect(parsePageHandle('joes-pizza-7k3x')).toBeNull()
    expect(parsePageHandle('joes-pizza-7k3x8m9')).toBeNull()
  })

  it('accepts the id on its own, which is the canonical form', () => {
    expect(parsePageHandle('7k3x8m')).toEqual({ slug: '', publicId: '7k3x8m' })
    expect(parsePageHandle('7K3X8M')?.publicId).toBe('7k3x8m')
  })

  it('refuses a hyphen with nothing in front of the id', () => {
    expect(parsePageHandle('-7k3x8m')).toBeNull()
  })

  it('refuses empty input', () => {
    expect(parsePageHandle('')).toBeNull()
    expect(parsePageHandle('   ')).toBeNull()
  })
})

describe('reading an address aloud', () => {
  it('folds the Crockford look-alikes, so someone who types what they see still arrives', () => {
    // I, l and 1 all look alike; O and 0 do too.
    expect(parsePageHandle('joes-pizza-7K3X8M')?.publicId).toBe('7k3x8m')
    expect(parsePageHandle('joes-pizza-abcI23')?.publicId).toBe('abc123')
    expect(parsePageHandle('joes-pizza-abcl23')?.publicId).toBe('abc123')
    expect(parsePageHandle('joes-pizza-abcO23')?.publicId).toBe('abc023')
  })

  it('has an alphabet of exactly 32 distinct characters, minus i, l, o and u', () => {
    expect(PUBLIC_ID_ALPHABET).toHaveLength(32)
    expect(new Set(PUBLIC_ID_ALPHABET).size).toBe(32)
    for (const ch of 'ilou') expect(PUBLIC_ID_ALPHABET).not.toContain(ch)
  })

  it('is six characters — four collides inside one metro', () => {
    expect(PUBLIC_ID_LENGTH).toBe(6)
  })
})

describe('one address per Page', () => {
  it('any slug in front of the id is an older form, so it redirects rather than being served as a second copy', () => {
    expect(isCanonicalHandle('7k3x8m', '7k3x8m')).toBe(true)
    expect(isCanonicalHandle('joes-pizza-7k3x8m', '7k3x8m')).toBe(false)
    expect(isCanonicalHandle('7K3X8M', '7k3x8m')).toBe(false)
  })

  it('round-trips its own output', () => {
    const h = pageHandle('zt9w4p')
    expect(parsePageHandle(h)).toEqual({ slug: '', publicId: 'zt9w4p' })
    expect(isCanonicalHandle(h, 'zt9w4p')).toBe(true)
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
