import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Issue #39 — new migrations carry a YYYYMMDDHHMMSS_ prefix.
//
// Sequential integers need a central counter: two agents working in parallel
// both pick the next number, and the result is not a merge conflict but two
// files that both exist with an undefined order between them. A timestamp
// needs no coordination.
//
// 001..041 are grandfathered — already applied everywhere, and renaming them
// would break the 23 files that read migration paths by name while buying no
// extra safety. Order is preserved regardless: '041_...' sorts before
// '2026...' lexicographically, so timestamped migrations always apply last.
// (Ruled go-forward-only, 2026-09-10.)

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')

const TIMESTAMPED = /^\d{14}_[a-z0-9_]+\.sql$/
const GRANDFATHERED = /^0(?:0[1-9]|[1-3]\d|4[01])_[a-z0-9_]+\.sql$/

export const isAcceptableMigrationName = (name: string) =>
  TIMESTAMPED.test(name) || GRANDFATHERED.test(name)

describe('issue #39 — migration naming', () => {
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql'))

  it('finds migrations to check', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('every migration is either timestamped or one of the grandfathered 001-041', () => {
    const bad = files.filter((f) => !isAcceptableMigrationName(f))
    expect(
      bad,
      `Not a valid migration name: ${bad.join(', ')}\n` +
        `New migrations use a YYYYMMDDHHMMSS_ prefix — generate one with:\n` +
        `  date -u +%Y%m%d%H%M%S`,
    ).toEqual([])
  })

  // The rule only bites if a NEW integer-prefixed file is rejected. Assert the
  // predicate directly so this cannot pass vacuously on a clean tree.
  it('rejects a new integer-prefixed migration', () => {
    expect(isAcceptableMigrationName('042_next_thing.sql')).toBe(false)
    expect(isAcceptableMigrationName('099_whatever.sql')).toBe(false)
    expect(isAcceptableMigrationName('42_short.sql')).toBe(false)
  })

  it('accepts a timestamped migration', () => {
    expect(isAcceptableMigrationName('20260910143000_page_posts.sql')).toBe(true)
  })

  it('still accepts the grandfathered range, including 041', () => {
    expect(isAcceptableMigrationName('001_extensions.sql')).toBe(true)
    expect(isAcceptableMigrationName('041_definer_hardening.sql')).toBe(true)
  })

  // Apply order is the whole reason grandfathering is safe.
  it('timestamped migrations sort after every grandfathered one', () => {
    const newest = '20000101000000_x.sql'
    const grandfathered = files.filter((f) => GRANDFATHERED.test(f))
    expect(grandfathered.every((f) => f < newest)).toBe(true)
  })
})
