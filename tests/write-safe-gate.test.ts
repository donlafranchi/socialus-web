// T151 (Issue #32) — gate write-bound suites on "is this instance safe to
// write to", not "is it localhost".
//
// The old gate asked `hostname ∈ {localhost, 127.0.0.1, ::1}`. Its intent was
// right — these suites create real auth users and write real objects, and
// pointing them at a remote project is unsafe — but a Supabase branch has a
// remote hostname, so the branch route would skip exactly as the sandbox did.
//
// The question becomes "is this instance safe to write to", and the answer is
// explicit, never inferred: an opt-in marker AND a host that is local or
// Supabase-hosted AND keys present. Both halves. Never the hostname alone,
// because a project URL and a branch URL are the same shape, and the failure
// mode of guessing wrong is a destructive suite running against production.

import { describe, it, expect } from 'vitest'
import { writeSafety } from './support/write-safe'

const LOCAL = 'http://127.0.0.1:54321'
const BRANCH = 'https://abcdefghijklmnopqrst.supabase.co'
const KEYS = { SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }
const EPHEMERAL = { SUPABASE_TEST_EPHEMERAL: '1' }

describe('T151 — the four combinations', () => {
  it('runs on a local host with the ephemeral marker', () => {
    expect(writeSafety({ SUPABASE_URL: LOCAL, ...KEYS, ...EPHEMERAL }).safe).toBe(true)
  })

  it('runs on a branch host with the ephemeral marker — the case the old gate blocked', () => {
    expect(writeSafety({ SUPABASE_URL: BRANCH, ...KEYS, ...EPHEMERAL }).safe).toBe(true)
  })

  it('refuses a branch-shaped host without the marker', () => {
    const v = writeSafety({ SUPABASE_URL: BRANCH, ...KEYS })
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/ephemeral/i)
  })

  it('refuses a host that is neither local nor Supabase-hosted, marker or not', () => {
    const v = writeSafety({ SUPABASE_URL: 'https://db.example.com', ...KEYS, ...EPHEMERAL })
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/not a local or Supabase-hosted/i)
  })
})

describe('T151 — the missing half is named specifically', () => {
  it('says "no ephemeral marker" differently from "this looks like production"', () => {
    const noMarker = writeSafety({ SUPABASE_URL: BRANCH, ...KEYS }).reason
    const production = writeSafety({
      SUPABASE_URL: BRANCH,
      ...KEYS,
      ...EPHEMERAL,
      NEXT_PUBLIC_SUPABASE_URL: BRANCH,
    }).reason
    expect(noMarker).not.toBe(production)
  })

  it('names missing keys rather than reporting a vague failure', () => {
    const v = writeSafety({ SUPABASE_URL: LOCAL, ...EPHEMERAL })
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/key/i)
  })

  it('reports an absent SUPABASE_URL as absent, not as unsafe', () => {
    expect(writeSafety({ ...KEYS, ...EPHEMERAL }).reason).toMatch(/SUPABASE_URL is not set/i)
  })
})

describe('T151 — the production refusal is unconditional', () => {
  // The one mistake that cannot be undone. `NEXT_PUBLIC_SUPABASE_URL` is what
  // this checkout's app talks to, so it is production by definition — no new
  // variable to set, and nothing to forget to set.
  it('refuses the host this checkout ships against, whatever the marker says', () => {
    const v = writeSafety({
      SUPABASE_URL: BRANCH,
      ...KEYS,
      ...EPHEMERAL,
      NEXT_PUBLIC_SUPABASE_URL: BRANCH,
    })
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/production/i)
  })

  it('refuses any ref listed in SUPABASE_PROTECTED_REFS', () => {
    const v = writeSafety({
      SUPABASE_URL: BRANCH,
      ...KEYS,
      ...EPHEMERAL,
      SUPABASE_PROTECTED_REFS: 'zzz, abcdefghijklmnopqrst',
    })
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/production/i)
  })

  it('does not treat a local app URL as production, so local testing still works', () => {
    const v = writeSafety({
      SUPABASE_URL: LOCAL,
      ...KEYS,
      ...EPHEMERAL,
      NEXT_PUBLIC_SUPABASE_URL: LOCAL,
    })
    expect(v.safe).toBe(true)
  })

  it('refuses production even when the marker and a protected ref both point at it', () => {
    // Belt and braces: neither signal may be overridden by the other.
    const v = writeSafety({
      SUPABASE_URL: BRANCH,
      ...KEYS,
      ...EPHEMERAL,
      NEXT_PUBLIC_SUPABASE_URL: BRANCH,
      SUPABASE_PROTECTED_REFS: 'abcdefghijklmnopqrst',
    })
    expect(v.safe).toBe(false)
  })
})
