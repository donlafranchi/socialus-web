// #363 — type and use case, changeable in settings (ruled 2026-10-05). The
// managing role follows the type, so a change of type swaps it.

import { describe, it, expect, vi } from 'vitest'
import { applyTypeChange } from './change-kind'

const G = 'g-1'
function client() {
  const query = vi.fn(async (_s: string, _p?: unknown[]) => ({ rows: [], rowCount: 1 }))
  return { query }
}
const sqls = (c: ReturnType<typeof client>) => c.query.mock.calls.map(([s, p]) => [s.replace(/\s+/g, ' '), p] as const)

describe('applyTypeChange', () => {
  it('does nothing when nothing changes', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'group', useCase: 'gathering' }, { kind: 'group' })).toBe(false)
    expect(c.query).not.toHaveBeenCalled()
  })

  it('a group becoming a business: selling, owners for stewards, a business row', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'group', useCase: 'gathering' }, { kind: 'business' })).toBe(true)
    const s = sqls(c)
    expect(s.some(([q, p]) => /set kind = \$2, use_case = \$3/.test(q) && p?.[1] === 'business' && p?.[2] === 'selling')).toBe(true)
    expect(s.some(([q, p]) => /update public\.group_memberships set role = \$2/.test(q) && p?.[1] === 'owner' && p?.[2] === 'steward')).toBe(true)
    expect(s.some(([q]) => /insert into public\.group_businesses/.test(q) && /on conflict/.test(q))).toBe(true)
  })

  it('a business becoming a group: gathering, stewards for owners, its business row kept', async () => {
    const c = client()
    await applyTypeChange(c, G, { kind: 'business', useCase: 'selling' }, { kind: 'group' })
    const s = sqls(c)
    expect(s.some(([q, p]) => /set kind/.test(q) && p?.[1] === 'group' && p?.[2] === 'gathering')).toBe(true)
    expect(s.some(([q, p]) => /set role = \$2/.test(q) && p?.[1] === 'steward' && p?.[2] === 'owner')).toBe(true)
    expect(s.some(([q]) => /group_businesses/.test(q))).toBe(false)
  })

  it('a use case alone changes without touching roles', async () => {
    const c = client()
    await applyTypeChange(c, G, { kind: 'business', useCase: 'selling' }, { useCase: 'service' })
    const s = sqls(c)
    expect(s.some(([, p]) => p?.[1] === 'business' && p?.[2] === 'service')).toBe(true)
    expect(s.some(([q]) => /group_memberships/.test(q))).toBe(false)
  })

  it('a use case that does not fit the type falls back to the type\'s first', async () => {
    const c = client()
    await applyTypeChange(c, G, { kind: 'business', useCase: 'selling' }, { useCase: 'gathering' })
    expect(c.query).not.toHaveBeenCalled()
  })

  it('a legacy stored kind is migrated by any save of the type', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'interest', useCase: null }, { kind: 'group' })).toBe(true)
  })
})
