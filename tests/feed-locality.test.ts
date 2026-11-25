import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeTags, clampLimit } from '../src/lib/feed/locality-feed'

// T087 — the shared tag and page-size rules, plus source-shape of the locality feed's SQL function.

describe('T087 — normalizeTags', () => {
  it('lowercases, dedupes, drops invalid', () => {
    expect(normalizeTags(['Live-Music', 'live-music', 'bad tag', 'jazz'])).toEqual([
      'live-music',
      'jazz',
    ])
  })
  it('returns null for empty/all-invalid/undefined', () => {
    expect(normalizeTags([])).toBeNull()
    expect(normalizeTags(['  ', 'Bad Tag'])).toBeNull()
    expect(normalizeTags(undefined)).toBeNull()
    expect(normalizeTags(null)).toBeNull()
  })
})

describe('T087 — clampLimit', () => {
  it('clamps to 1..100, default 50', () => {
    expect(clampLimit(undefined)).toBe(50)
    expect(clampLimit(null)).toBe(50)
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(250)).toBe(100)
    expect(clampLimit(12)).toBe(12)
  })
})

describe('T087 — migration source shape', () => {
  const sql = readFileSync(
    resolve(__dirname, '..', 'supabase', 'migrations', '027_locality_feed.sql'),
    'utf8',
  )
  it('intersects against the place polygon, orders by recency, grants anon', () => {
    expect(sql).toMatch(/st_intersects/i)
    expect(sql).toMatch(/order by/i)
    expect(sql).toMatch(/grant execute/i)
    expect(sql).toMatch(/to anon/i)
  })
})
