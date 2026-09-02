import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Feed hero images — file-shape assertions for items.photo_url, the MV rebuild
// that surfaces a per-item photo_url, and the three consuming RPCs. Live DB
// behaviour is covered by the Phase-1 evals (T103/T106 precedent — no Docker
// in this build env).

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('036_item_photo_url.sql', () => {
  const file = resolve(MIG, '036_item_photo_url.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = stripComments(readFileSync(file, 'utf8'))

  it('adds a general nullable items.photo_url column', () => {
    expect(sql).toMatch(/alter table\s+public\.items\s+add column if not exists\s+photo_url\s+text/i)
  })

  it('drops then recreates the MV (Postgres cannot ALTER a column into an MV)', () => {
    expect(sql).toMatch(/drop materialized view if exists\s+public\.discoverable_items/i)
    expect(sql).toMatch(/create materialized view\s+public\.discoverable_items as/i)
  })

  it('surfaces photo_url as the spine column falling back to the first product photo', () => {
    expect(sql).toMatch(/coalesce\(\s*nullif\(btrim\(i\.photo_url\), ''\)\s*,\s*nullif\(btrim\(ip\.photo_urls\[1\]\), ''\)\s*\)\s+as\s+photo_url/i)
    expect(sql).toMatch(/left join\s+public\.item_products\s+ip\s+on\s+ip\.item_id\s*=\s*i\.id/i)
  })

  it('preserves starts_at and every index from the prior MV definition', () => {
    expect(sql).toMatch(/gs\.starts_at\s+as\s+starts_at/i)
    expect(sql).toMatch(
      /create unique index\s+unique_idx_discoverable_items\s+on\s+public\.discoverable_items\s*\(\s*item_id\s*\)/i,
    )
    for (const idx of ['kind', 'category', 'group', 'recency', 'starts_at']) {
      expect(sql).toMatch(new RegExp(`idx_discoverable_items_${idx}`, 'i'))
    }
    expect(sql).toMatch(/idx_discoverable_items_geography\s+on\s+public\.discoverable_items\s+using gist/i)
  })

  it('re-grants select on the MV to anon + authenticated', () => {
    expect(sql).toMatch(/grant select on\s+public\.discoverable_items\s+to\s+anon,\s*authenticated/i)
  })

  it('drops each RPC before recreating it (return-type change)', () => {
    expect(sql).toMatch(/drop function if exists\s+public\.locality_feed_items\(uuid, text\[\], int\)/i)
    expect(sql).toMatch(/drop function if exists\s+public\.venue_nearby_items\(uuid, uuid, double precision\)/i)
    expect(sql).toMatch(/drop function if exists\s+public\.venue_hosted_items\(uuid, uuid\)/i)
  })

  it('returns photo_url from all three feed RPCs', () => {
    const bodies = sql.split(/create (?:or replace )?function/i).slice(1)
    const named = (n: string) => bodies.find((b) => b.trim().startsWith(`public.${n}`))
    for (const fn of ['locality_feed_items', 'venue_nearby_items', 'venue_hosted_items']) {
      const body = named(fn)
      expect(body, `${fn} defined`).toBeTruthy()
      expect(body).toMatch(/photo_url\s+text/i)
    }
  })

  it('keeps the T106 upcoming-only filters on all three RPCs', () => {
    expect(sql.match(/starts_at is null or\s+\S*starts_at >= now\(\)/gi)?.length).toBe(3)
  })

  it('re-grants execute on the three RPCs', () => {
    expect(sql).toMatch(/grant execute on function\s+public\.locality_feed_items\(uuid, text\[\], int\)\s+to\s+anon,\s*authenticated/i)
    expect(sql).toMatch(/grant execute on function\s+public\.venue_nearby_items\(uuid, uuid, double precision\)\s+to\s+anon,\s*authenticated/i)
    expect(sql).toMatch(/grant execute on function\s+public\.venue_hosted_items\(uuid, uuid\)\s+to\s+anon,\s*authenticated/i)
  })
})
