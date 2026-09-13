import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// T123 (Issue #13) — F058's schema: the reports table, the two hide columns
// on groups, and the three new group_events kinds.
//
// File-shape assertions, matching the project's migration-test convention
// (see migrations-page-identity.test.ts). The DDL is also applied to a local
// Postgres inside a transaction and rolled back — see the PR for that check.
//
// The load-bearing assertion in here is the one about policies: `reports` gets
// RLS enabled and NO policies at all. Writes go through the action layer per
// ADR-7, and nobody — not even the reporter — reads a report through the
// browser client. A SELECT policy appearing on this table later would make
// every report readable to someone it was never meant for, so the test asserts
// the absence, not just the presence of RLS.

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('20260913211209_reports_and_photo_hiding.sql', () => {
  const file = resolve(MIG, '20260913211209_reports_and_photo_hiding.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : ''

  describe('public.reports', () => {
    it('creates the table', () => {
      expect(sql).toMatch(/create table public\.reports/i)
    })

    it('carries the reporter, the subject, and the free-text body', () => {
      expect(sql).toMatch(/reporter_member_id\s+uuid\s+not null\s+references public\.members\s*\(\s*id\s*\)/i)
      expect(sql).toMatch(/subject_kind\s+text\s+not null/i)
      expect(sql).toMatch(/subject_id\s+uuid\s+not null/i)
      expect(sql).toMatch(/body\s+text\s+not null/i)
      expect(sql).toMatch(/created_at\s+timestamptz\s+not null default now\(\)/i)
    })

    it("constrains subject_kind to 'group' — posts join the CHECK when posts exist", () => {
      expect(sql).toMatch(/check\s*\(\s*subject_kind\s+in\s*\(\s*'group'\s*\)\s*\)/i)
      // Items are out of the model. Scoped to the DDL, not the whole file —
      // a `comment on` explaining why 'item' is absent is not a regression,
      // an 'item' in the CHECK is. See model.md § There are no Items.
      const ddl = sql.match(/create table public\.reports\s*\(([\s\S]*?)\n\);/i)
      expect(ddl).not.toBeNull()
      expect(ddl ? ddl[1] : '').not.toMatch(/'item'/i)
    })

    it('carries the review columns the operator surface writes', () => {
      expect(sql).toMatch(/reviewed_at\s+timestamptz/i)
      expect(sql).toMatch(/reviewed_by_member_id\s+uuid\s+references public\.members\s*\(\s*id\s*\)/i)
      expect(sql).toMatch(/outcome\s+text/i)
      expect(sql).toMatch(/check\s*\(\s*outcome\s+in\s*\(\s*'restored'\s*,\s*'removed'\s*\)\s*\)/i)
    })

    it('ties outcome and reviewed_at together so neither can be set alone', () => {
      expect(sql).toMatch(/check\s*\(\s*\(\s*reviewed_at is null\s*\)\s*=\s*\(\s*outcome is null\s*\)\s*\)/i)
    })

    it('soft-deletes, per the project\'s no-hard-deletes rule', () => {
      expect(sql).toMatch(/removed_at\s+timestamptz/i)
    })

    it('indexes the operator queue: unreviewed, oldest first', () => {
      expect(sql).toMatch(/create index[^;]*on public\.reports[^;]*reviewed_at is null/i)
    })

    it('indexes lookups by subject', () => {
      expect(sql).toMatch(/create index[^;]*on public\.reports\s*\(\s*subject_kind\s*,\s*subject_id\s*\)/i)
    })

    it('enables RLS', () => {
      expect(sql).toMatch(/alter table public\.reports enable row level security/i)
    })

    it('creates NO policy on reports — action-layer-only writes, no client reads (ADR-7)', () => {
      const policies = sql.match(/create policy[\s\S]*?on public\.reports/gi) ?? []
      expect(
        policies,
        'reports must have zero policies: writes go through the action layer, ' +
          'and a report is never readable through the browser client.',
      ).toEqual([])
    })
  })

  describe('public.groups hide columns', () => {
    it('adds photo_hidden_at as nullable timestamptz — non-null means hidden', () => {
      expect(sql).toMatch(/alter table public\.groups\s+add column\s+photo_hidden_at\s+timestamptz/i)
    })

    it('adds photo_hide_locked_url as nullable text, not a boolean', () => {
      expect(sql).toMatch(/alter table public\.groups\s+add column\s+photo_hide_locked_url\s+text/i)
    })

    it('does not use a bare boolean lock, which would outlive the photo it protects', () => {
      // A boolean lock is set on restore and never cleared, so an owner whose
      // benign photo was restored could then upload a genuinely bad one that
      // could never be auto-hidden again. Scoping the lock to the URL it was
      // granted for makes a photo change un-lock the Page on its own — no
      // handler has to remember to clear it.
      expect(sql).not.toMatch(/photo_hide_locked\s+boolean/i)
    })

    it('does not touch photo_url — hiding is never a deletion', () => {
      expect(sql).not.toMatch(/drop column\s+photo_url/i)
      expect(sql).not.toMatch(/update public\.groups\s+set photo_url/i)
    })

    it('indexes the hidden ones, partially', () => {
      expect(sql).toMatch(/create index[^;]*on public\.groups[^;]*photo_hidden_at is not null/i)
    })
  })

  describe('group_events.event_kind', () => {
    it('adds the three new kinds and preserves all thirteen existing ones', () => {
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
        'group.reported',
        'group.photo_hidden',
        'group.photo_restored',
      ]) {
        expect(sql).toContain(`'${kind}'`)
      }
    })
  })

  describe('lineage', () => {
    it('does not resurrect the vendor-era report shape', () => {
      // web/scripts/001-create-tables.sql's reports table was a
      // values-attestation, not a report. New lineage — see Issue #63.
      for (const dead of ['pillar', 'personal_witness', 'source_url', 'business_id']) {
        expect(sql).not.toMatch(new RegExp(`\\b${dead}\\b`, 'i'))
      }
    })
  })
})
