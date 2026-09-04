// T119 — 037_group_url_prefixes.sql. File-shape assertions (the T103/T106/T036
// precedent — no Docker in this build env); live behaviour is covered by the
// F038/F034 evals and was verified by hand against the production seed.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('037_group_url_prefixes.sql', () => {
  const file = resolve(MIG, '037_group_url_prefixes.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = stripComments(readFileSync(file, 'utf8'))

  it('defines both derivation functions', () => {
    expect(sql).toMatch(/create or replace function\s+public\.place_url_path\s*\(\s*p_place_id uuid\s*\)/i)
    expect(sql).toMatch(/create or replace function\s+public\.group_url_prefixes\s*\(\s*p_group_ids uuid\[\]\s*\)/i)
  })

  it('skips the county tier, per ADR-0022 URL transparency', () => {
    expect(sql).toMatch(/where\s+kind\s*<>\s*'county'/i)
  })

  it('orders path segments outermost-first so the URL reads root → leaf', () => {
    expect(sql).toMatch(/string_agg\(\s*slug\s*,\s*'\/'\s+order by depth desc\s*\)/i)
  })

  it('excludes soft-deleted Places from the walk at every level', () => {
    // Both the anchor row and each recursive step must filter, or a deleted
    // mid-hierarchy Place would silently contribute its slug to the path.
    expect(sql.match(/deleted_at is null/gi)?.length).toBeGreaterThanOrEqual(2)
  })

  it('bounds the ancestor walk so a places cycle cannot hang every browse', () => {
    expect(sql).toMatch(/c\.depth\s*<\s*\d+/i)
  })

  it('is security invoker — the whole chain is anon-readable under RLS', () => {
    expect(sql).not.toMatch(/security definer/i)
    // Count declarations only — the phrase also appears in a comment-on string.
    expect(sql.match(/stable\s+security invoker/gi)?.length).toBe(2)
  })

  it('pins search_path on both functions', () => {
    expect(sql.match(/set search_path\s*=\s*public, pg_catalog/gi)?.length).toBe(2)
  })

  it('never resolves a prefix for a dissolved Group', () => {
    expect(sql).toMatch(/g\.dissolved_at is null/i)
  })

  it('excludes soft-deleted anchor Locations rather than pathing through them', () => {
    expect(sql).toMatch(/left join\s+public\.locations\s+l[\s\S]{0,120}?l\.deleted_at is null/i)
  })

  it('left-joins the anchor Location so a Group without one still returns its slug', () => {
    // The caller needs the row back with a null place_path to fall through to
    // the Member path; an inner join would drop the Group entirely.
    expect(sql).toMatch(/left join\s+public\.locations\s+l\s+on\s+l\.id\s*=\s*g\.anchor_location_id/i)
  })

  it('grants execute to anon so signed-out browse builds canonical links', () => {
    expect(sql.match(/grant execute on function[\s\S]{0,120}?to anon, authenticated/gi)?.length).toBe(2)
  })

  it('leaves the materialized view and the three feed RPCs untouched', () => {
    // Deriving live is the decision; a drop/rebuild here would mean the path
    // stales until an unrelated publish refreshes the MV.
    expect(sql).not.toMatch(/materialized view/i)
    expect(sql).not.toMatch(/locality_feed_items|venue_nearby_items|venue_hosted_items/i)
  })
})
