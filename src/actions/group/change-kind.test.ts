// #363 — purpose first, type for listing (Don ruled A, 2026-10-05). Both are
// changeable in settings; a new purpose brings its type unless the owner names
// one, and the managing role follows the type.

import { describe, it, expect, vi } from 'vitest'
import { applyTypeChange } from './change-kind'

const G = 'g-1'
function client() {
  const query = vi.fn(async (_s: string, _p?: unknown[]) => ({ rows: [], rowCount: 1 }))
  return { query }
}
const sqls = (c: ReturnType<typeof client>) => c.query.mock.calls.map(([s, p]) => [s.replace(/\s+/g, ' '), p] as const)
const setRow = (c: ReturnType<typeof client>) => sqls(c).find(([q]) => /set kind = \$2, purpose = \$3/.test(q))?.[1]

describe('applyTypeChange', () => {
  it('does nothing when nothing changes', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'group', purpose: 'gather' }, { kind: 'group' })).toBe(false)
    expect(c.query).not.toHaveBeenCalled()
  })

  it('a new purpose brings its type: gather to sell makes a business, owners for stewards, a business row', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'group', purpose: 'gather' }, { purpose: 'sell' })).toBe(true)
    expect(setRow(c)).toEqual([G, 'business', 'sell'])
    const s = sqls(c)
    expect(s.some(([q, p]) => /update public\.group_memberships set role = \$2/.test(q) && p?.[1] === 'owner' && p?.[2] === 'steward')).toBe(true)
    expect(s.some(([q]) => /insert into public\.group_businesses/.test(q) && /on conflict/.test(q))).toBe(true)
  })

  it('the owner can keep a type the purpose would not choose: teach, listed as a social group', async () => {
    const c = client()
    await applyTypeChange(c, G, { kind: 'group', purpose: 'gather' }, { purpose: 'offer', kind: 'group' })
    expect(setRow(c)).toEqual([G, 'group', 'offer'])
    expect(sqls(c).some(([q]) => /group_memberships/.test(q))).toBe(false)
  })

  it('a type change alone keeps the purpose: a business listed as a group, stewards for owners, its business row kept', async () => {
    const c = client()
    await applyTypeChange(c, G, { kind: 'business', purpose: 'sell' }, { kind: 'group' })
    expect(setRow(c)).toEqual([G, 'group', 'sell'])
    const s = sqls(c)
    expect(s.some(([q, p]) => /set role = \$2/.test(q) && p?.[1] === 'steward' && p?.[2] === 'owner')).toBe(true)
    expect(s.some(([q]) => /group_businesses/.test(q))).toBe(false)
  })

  it('a legacy stored kind is migrated by any save of the type', async () => {
    const c = client()
    expect(await applyTypeChange(c, G, { kind: 'interest', purpose: null }, { kind: 'group' })).toBe(true)
    expect(setRow(c)).toEqual([G, 'group', 'gather'])
  })
})
