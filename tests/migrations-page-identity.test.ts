import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// T141 — one migration for the three things F061 needs on the groups
// spine: a category column, a free-text capture table, a photo column,
// and the new group_events kinds F061/F056 both need. File-shape
// assertions, matching the project's migration-test convention.

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('20260911160535_page_identity.sql', () => {
  // Renamed from 040_ to match the version the remote recorded when this was
  // applied to production out-of-band (2026-09-11). Same DDL, verified by hash.
  const file = resolve(MIG, '20260911160535_page_identity.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : ''

  it('adds groups.category as nullable text with no CHECK or enum', () => {
    expect(sql).toMatch(/alter table public\.groups\s+add column\s+category\s+text/i)
    // The vocabulary lives in code (T144), not the schema — no CHECK
    // constraint naming any of the twelve terms should exist for this column.
    expect(sql).not.toMatch(/check\s*\(\s*category\s+in\s*\(/i)
  })

  it('indexes groups.category with a plain btree index', () => {
    expect(sql).toMatch(/create index[^;]*on public\.groups\s*\(\s*category\s*\)/i)
  })

  it('adds groups.photo_url as nullable text', () => {
    expect(sql).toMatch(/alter table public\.groups\s+add column\s+photo_url\s+text/i)
  })

  it('creates group_category_suggestions with the right shape', () => {
    expect(sql).toMatch(/create table public\.group_category_suggestions/i)
    expect(sql).toMatch(/group_id\s+uuid\s+not null\s+references public\.groups\s*\(\s*id\s*\)/i)
    expect(sql).toMatch(/member_id\s+uuid\s+not null\s+references public\.members\s*\(\s*id\s*\)/i)
    expect(sql).toMatch(/raw_text\s+text\s+not null/i)
    expect(sql).toMatch(/normalized_text\s+text\s+not null/i)
    expect(sql).toMatch(/created_at\s+timestamptz\s+not null default now\(\)/i)
  })

  it('has no status or promoted column on the suggestions table — promotion is a human act, not automatic', () => {
    const tableMatch = sql.match(/create table public\.group_category_suggestions\s*\(([\s\S]*?)\);/i)
    expect(tableMatch).not.toBeNull()
    const body = tableMatch ? tableMatch[1] : ''
    expect(body).not.toMatch(/\bstatus\b/i)
    expect(body).not.toMatch(/\bpromoted\b/i)
  })

  it('indexes group_category_suggestions on the normalized column', () => {
    expect(sql).toMatch(/create index[^;]*on public\.group_category_suggestions\s*\(\s*normalized_text\s*\)/i)
  })

  it('enables RLS on group_category_suggestions', () => {
    expect(sql).toMatch(/alter table public\.group_category_suggestions enable row level security/i)
  })

  it('extends group_events_event_kind_check with the three new members, preserving the existing ten', () => {
    expect(sql).toMatch(/drop constraint if exists group_events_event_kind_check/i)
    expect(sql).toMatch(/add constraint group_events_event_kind_check/i)
    for (const kind of [
      'group.created',
      'group.activated',
      'group.member_joined',
      'group.member_left',
      'group.role_changed',
      'group.steward_transferred',
      'group.dormant',
      'group.dormancy_extended',
      'group.revived',
      'group.dissolved',
      'group.photo_set',
      'group.photo_removed',
      'group.updated',
    ]) {
      expect(sql).toContain(`'${kind}'`)
    }
  })

  it('does not add values_statement or tagline — those are F056\'s, not this ticket\'s', () => {
    expect(sql).not.toMatch(/values_statement/i)
    expect(sql).not.toMatch(/tagline/i)
  })
})
