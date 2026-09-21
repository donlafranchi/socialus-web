import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { MIGRATION_VERSIONS } from './manifest'

// Issue #164 — the manifest is a committed artefact, so it can go stale, so a
// test compares it against the directory. Same arrangement as
// src/ontology/registry.json, for the same reason: a generated file nothing
// checks is a file that quietly stops being true.

const ROOT = resolve(__dirname, '..', '..', '..')
const MIG = resolve(ROOT, 'supabase', 'migrations')

describe('the migration manifest', () => {
  it('lists every migration in supabase/migrations/', () => {
    const onDisk = readdirSync(MIG)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0])
      .sort()
    expect([...MIGRATION_VERSIONS]).toEqual(onDisk)
  })

  it('is not empty — an empty manifest makes every database look up to date', () => {
    expect(MIGRATION_VERSIONS.length).toBeGreaterThan(0)
  })

  it('holds bare versions, exactly as schema_migrations records them', () => {
    for (const v of MIGRATION_VERSIONS) expect(v).toMatch(/^\d+$/)
  })

  it('is regenerated and committed — `--check` passes on the tree as it stands', () => {
    // The stale-manifest guard, run the way CI runs it.
    execFileSync('npx', ['tsx', 'scripts/generate-migration-manifest.ts', '--check'], {
      cwd: ROOT,
      stdio: 'pipe',
    })
  })
})
