// Page kinds (dispatch, 2026-10-05): Business, Group or Organization, changeable
// in settings. The managing role follows the kind, so a change swaps it.

import { describe, it, expect, vi } from 'vitest'
import { applyKindChange } from './change-kind'

const G = 'g-1'
function client() {
  const query = vi.fn(async (_s: string, _p?: unknown[]) => ({ rows: [], rowCount: 1 }))
  return { query }
}
const sqls = (c: ReturnType<typeof client>) => c.query.mock.calls.map(([s, p]) => [s.replace(/\s+/g, ' '), p] as const)

describe('applyKindChange', () => {
  it('does nothing when the kind is unchanged, keeping a finer stored kind', async () => {
    const c = client()
    expect(await applyKindChange(c, G, 'practice', 'group')).toBe(false)
    expect(c.query).not.toHaveBeenCalled()
  })

  it('a group becoming a business: stored kind, owners for stewards, a business row', async () => {
    const c = client()
    expect(await applyKindChange(c, G, 'interest', 'business')).toBe(true)
    const s = sqls(c)
    expect(s.some(([q, p]) => /update public\.groups set kind = \$2/.test(q) && p?.[1] === 'business')).toBe(true)
    expect(s.some(([q, p]) => /update public\.group_memberships set role = \$2/.test(q) && p?.[1] === 'owner' && p?.[2] === 'steward')).toBe(true)
    expect(s.some(([q]) => /insert into public\.group_businesses/.test(q) && /on conflict/.test(q))).toBe(true)
  })

  it('a business becoming an organization: event_anchored, stewards for owners, its business row kept', async () => {
    const c = client()
    await applyKindChange(c, G, 'business', 'organization')
    const s = sqls(c)
    expect(s.some(([q, p]) => /set kind = \$2/.test(q) && p?.[1] === 'event_anchored')).toBe(true)
    expect(s.some(([q, p]) => /set role = \$2/.test(q) && p?.[1] === 'steward' && p?.[2] === 'owner')).toBe(true)
    expect(s.some(([q]) => /group_businesses/.test(q))).toBe(false)
  })

  it('a group becoming an organization keeps its stewards', async () => {
    const c = client()
    await applyKindChange(c, G, 'interest', 'organization')
    expect(sqls(c).some(([q]) => /group_memberships/.test(q))).toBe(false)
  })
})
