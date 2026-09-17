import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// F070 — static-shape guards over the social-links migration, in the style of
// the other tests/migrations-*.test.ts files: they read the SQL rather than a
// database, so they run anywhere and catch a rewrite that drops a constraint.

const DIR = join(process.cwd(), 'supabase/migrations')
const file = readdirSync(DIR).find((f) => f.endsWith('_group_social_links.sql'))
const sql = file ? readFileSync(join(DIR, file), 'utf8') : ''

describe('F070 — groups.social_links', () => {
  it('the migration exists', () => {
    expect(file).toBeDefined()
  })

  it('adds a jsonb column that defaults to an empty object and is never null', () => {
    expect(sql).toMatch(/add column social_links jsonb not null default '\{\}'::jsonb/i)
  })

  it('refuses anything that is not a flat object', () => {
    expect(sql).toMatch(/jsonb_typeof\(social_links\) = 'object'/i)
  })

  // The platform set is closed on purpose. An open key space on a column
  // rendered as href is an open redirect surface with a label attached.
  it('closes the platform set', () => {
    expect(sql).toMatch(/groups_social_links_known_platforms/i)
    for (const p of ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'bluesky', 'website']) {
      expect(sql).toContain(`'${p}'`)
    }
  })

  // The one that matters: `javascript:` in an href is the whole XSS class, and
  // this column is rendered as href on a public Page.
  it('requires every value to be an https URL', () => {
    expect(sql).toMatch(/groups_social_links_https_only/i)
    expect(sql).toMatch(/\^https:\/\//)
  })

  // Postgres refuses a subquery in a CHECK (SQLSTATE 0A000), and inspecting an
  // object's keys needs a set-returning function. CI caught the inline version;
  // this keeps it caught.
  it('uses IMMUTABLE helper functions rather than subqueries in the CHECKs', () => {
    expect(sql).toMatch(/create or replace function public\.social_links_keys_known/i)
    expect(sql).toMatch(/create or replace function public\.social_links_values_https/i)
    expect(sql).toMatch(/immutable/i)
    expect(sql).not.toMatch(/check\s*\(\s*not exists/i)
  })

  // Issue #36: a function that ships with a mutable search_path is the finding
  // the definer hardening closed. tests/migrations-definer-hardening.test.ts
  // enforces it across every migration and caught these two.
  it('pins search_path on both helpers', () => {
    const pins = sql.match(/set search_path = public, pg_catalog/gi) ?? []
    expect(pins).toHaveLength(2)
  })

  it('refuses http as well as javascript — no downgrade, no scheme smuggling', () => {
    expect(sql).not.toMatch(/\^https\?:/)
  })
})
