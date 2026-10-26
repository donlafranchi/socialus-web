import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// #555 — the database is Supabase us-west-2 (Oregon); functions on Vercel's default region (iad1, Virginia) pay
// a cross-country round trip on every sequential query, which is what makes a Page's server render take seconds.
// Pin the functions beside the database. pdx1 is Vercel's Portland region, the nearest to us-west-2.
describe('functions run beside the database', () => {
  it('vercel.json pins the functions to Portland, next to Supabase us-west-2', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8')) as { regions?: string[] }
    expect(cfg.regions).toEqual(['pdx1'])
  })
})
