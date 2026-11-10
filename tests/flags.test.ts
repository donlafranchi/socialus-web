import { describe, it, expect, vi } from 'vitest'

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => { throw new Error('no pool in unit tests') } }))

import { resolveFlag } from '@/lib/flags/resolve'
import { flagOnFor } from '@/lib/flags/check'
import { referencesIn, report, codeReferences } from '../scripts/flags-references'

// #1227 Feature flags of our own, builder accounts first (PM, 2026-11-10).

const member = { builder: false, operator: false }
const builder = { builder: true, operator: false }
const operator = { builder: false, operator: true }

describe('who a flag is on for', () => {
  it('with no row, builders and the operator only: new work starts dark', () => {
    expect(resolveFlag(null, member)).toBe(false)
    expect(resolveFlag(null, builder)).toBe(true)
    expect(resolveFlag(null, operator)).toBe(true)
  })
  it('builders, everyone, off', () => {
    expect([member, builder, operator].map((v) => resolveFlag('builders', v))).toEqual([false, true, true])
    expect([member, builder, operator].map((v) => resolveFlag('everyone', v))).toEqual([true, true, true])
    expect([member, builder, operator].map((v) => resolveFlag('off', v))).toEqual([false, false, false])
  })
  it('anything unrecognised is off', () => {
    expect(resolveFlag('half', builder)).toBe(false)
  })
})

describe('the server-side lookup', () => {
  const q = (row: Record<string, unknown>) => vi.fn(async () => ({ rows: [row] }))
  it('reads the audience and whether the member is a builder', async () => {
    const query = q({ audience: null, builder: true })
    expect(await flagOnFor('x', 'b1', query)).toBe(true)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('public.feature_flags'), ['x', 'b1'])
    expect(await flagOnFor('x', 'm1', q({ audience: null, builder: false }))).toBe(false)
    expect(await flagOnFor('x', null, q({ audience: 'everyone', builder: false }))).toBe(true)
  })
  it('a database failure is off for everyone, builders included', async () => {
    expect(await flagOnFor('x', 'b1', vi.fn(async () => { throw new Error('down') }))).toBe(false)
  })
  it('the operator sees builder flags without a builder row', async () => {
    const prev = process.env.OPERATOR_MEMBER_ID
    process.env.OPERATOR_MEMBER_ID = 'owner-1'
    try {
      expect(await flagOnFor('x', 'owner-1', q({ audience: 'builders', builder: false }))).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.OPERATOR_MEMBER_ID
      else process.env.OPERATOR_MEMBER_ID = prev
    }
  })
})

describe('finding flags in code', () => {
  it('finds literal keys with their line, and reports a key it cannot read', () => {
    const text = `a\nif (await flagOn('new-map')) x\nconst k = 'y'; flagOn(k)\nflagOn("two")`
    expect(referencesIn(text, 'f.ts')).toEqual([
      { key: 'new-map', file: 'f.ts', line: 2 },
      { key: null, file: 'f.ts', line: 3 },
      { key: 'two', file: 'f.ts', line: 4 },
    ])
  })

  const flags = {
    'new-map': { hides: 'the new map', issue: 1, removeBy: '2026-12-01' },
    'old-thing': { hides: 'an old thing', issue: 2, removeBy: '2026-11-01' },
  }
  const refs = [
    { key: 'new-map', file: 'a.ts', line: 1 },
    { key: 'ghost', file: 'b.ts', line: 2 },
    { key: null, file: 'c.ts', line: 3 },
  ]

  it('lists flags past their removal date', () => {
    expect(report(flags, refs, '2026-11-10').pastDue.map((p) => p.key)).toEqual(['old-thing'])
    expect(report(flags, refs, '2026-10-01').pastDue).toEqual([])
  })
  it('catches a flag read but not declared, and one declared but never read', () => {
    const r = report(flags, refs, '2026-11-10')
    expect(r.undeclared.map((u) => u.key)).toEqual(['ghost', null])
    expect(r.unread).toEqual(['old-thing'])
  })
  it('catches a removal date that is not a date', () => {
    expect(report({ x: { hides: 'x', issue: 1, removeBy: 'soon' } }, [{ key: 'x', file: 'a', line: 1 }]).badDates).toEqual(['x'])
  })

  it('this tree: every flag read is declared, every declared flag is read, every date is a date', () => {
    const r = report(undefined, codeReferences())
    expect(r.undeclared, 'flagOn reads a key not in src/lib/flags/registry.ts').toEqual([])
    expect(r.unread, 'declared in src/lib/flags/registry.ts but read nowhere: remove it').toEqual([])
    expect(r.badDates).toEqual([])
    // Past its removal date is listed, not failed: a date passing must not turn
    // every open PR red. `npm run flags:check` shows the list.
    if (r.pastDue.length) console.warn(`Flags past their removal date: ${r.pastDue.map((p) => `${p.key} (${p.removeBy})`).join(', ')}`)
  })
})
