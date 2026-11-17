// chore — no two migration files may share a version.
//
// On 2026-11-16 two branches each added a migration numbered 20261116120000:
// knowledge_shipped (bug #1340) and knowledge_maps_for_members (#1343). The
// version is the whole key production records, so whichever applied first
// owned it and the other was silently treated as already applied. The members
// migration merged green and never ran in production.
//
// The drift script now compares names too (tests/migrations-drift-parse.test.ts),
// which catches the branch that merges second. This catches the pair as soon
// as both files sit in one tree — a PR's merge ref with main, or main itself.

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(__dirname, '../supabase/migrations')

/** Versions carried by more than one file, each with the files that carry it. */
export function duplicateVersions(files: string[]): Map<string, string[]> {
  const byVersion = new Map<string, string[]>()
  for (const f of files) {
    if (!f.endsWith('.sql')) continue
    const version = f.split('_')[0]!
    byVersion.set(version, [...(byVersion.get(version) ?? []), f])
  }
  return new Map([...byVersion].filter(([, fs]) => fs.length > 1))
}

describe('migration versions are unique', () => {
  it('catches the 2026-11-16 pair (fixture)', () => {
    const dups = duplicateVersions([
      '20261113140000_waitlist_answers.sql',
      '20261116120000_knowledge_shipped.sql',
      '20261116120000_knowledge_maps_for_members.sql',
    ])
    expect([...dups.keys()]).toEqual(['20261116120000'])
    expect(dups.get('20261116120000')).toHaveLength(2)
  })

  it('passes distinct versions (fixture)', () => {
    expect(
      duplicateVersions([
        '20261116120000_knowledge_shipped.sql',
        '20261117040000_knowledge_maps_for_members.sql',
      ]).size,
    ).toBe(0)
  })

  // [guard-proves-itself]: seen failing with a duplicate copied into the real
  // directory before it was trusted.
  it('no two files in supabase/migrations share a version', () => {
    const dups = duplicateVersions(readdirSync(DIR))
    const report = [...dups].map(([v, fs]) => `${v}: ${fs.join(', ')}`).join('\n')
    expect(
      dups.size,
      `Two migrations share a version. Production records only the version, so ` +
        `whichever applies second is skipped as "already applied". Renumber the ` +
        `newer one to a version later than anything applied:\n${report}`,
    ).toBe(0)
  })
})
