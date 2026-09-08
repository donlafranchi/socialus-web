import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// T137 — findability follows what you've published. File-shape assertions for
// the anon-readable projection that replaces the opt-in flag on the Member-link
// decision, and the removal of the one-time prompt substrate.

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const stripComments = (s: string) =>
  s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('038_member_has_published.sql', () => {
  const file = resolve(MIG, '038_member_has_published.sql')
  it('exists', () => expect(existsSync(file)).toBe(true))
  const sql = existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : ''

  it('creates the member_public_has_published view', () => {
    expect(sql).toMatch(/create or replace view\s+public\.member_public_has_published\s+as/i)
  })

  it('counts an explicit managing-role membership in an active, non-dissolved Group', () => {
    expect(sql).toMatch(/gm\.left_at is null/i)
    expect(sql).toMatch(/gm\.source\s*=\s*'explicit'/i)
    expect(sql).toMatch(/g\.lifecycle_state\s*=\s*'active'/i)
    expect(sql).toMatch(/g\.dissolved_at is null/i)
    expect(sql).toMatch(/g\.kind\s*=\s*'business'\s+and\s+gm\.role in \('owner','staff'\)/i)
    expect(sql).toMatch(/g\.kind\s*<>\s*'business'\s+and\s+gm\.role\s*=\s*'steward'/i)
  })

  it('counts a published, non-deleted Item', () => {
    expect(sql).toMatch(/i\.state\s*=\s*'published'/i)
    expect(sql).toMatch(/i\.deleted_at is null/i)
  })

  it('never consults the opt-in flag', () => {
    const noComments = sql.replace(/comment on [^;]*;/gi, '')
    expect(noComments).not.toMatch(/is_discoverable/i)
  })

  it('grants select to anon + authenticated', () => {
    expect(sql).toMatch(
      /grant select on\s+public\.member_public_has_published\s+to\s+anon,\s*authenticated/i,
    )
  })

  it('drops member_prompts (the prompt is deleted, not built)', () => {
    expect(sql).toMatch(/drop table if exists\s+public\.member_prompts/i)
  })

  it('leaves member_privacy.is_discoverable in place', () => {
    expect(sql).not.toMatch(/drop column\s+is_discoverable/i)
  })
})
