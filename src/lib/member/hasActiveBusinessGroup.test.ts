// Seller signal for the nav CTA — replaces the dead `businesses` read.
// Trace: planning/backlog/audit-vendor-market-retirement.md § 1.3
// Definition of "Seller" (business-Group clause): CLAUDE.md § Naming conventions rule 4.

import { describe, it, expect, vi } from 'vitest'
import { hasActiveBusinessGroup } from './hasActiveBusinessGroup'
import type { SupabaseClient } from '@supabase/supabase-js'

function stub(response: { data: unknown; error: { message: string } | null }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: Record<string, unknown> = {}
  const passthrough = (name: string) => (...args: unknown[]) => {
    calls.push([name, args])
    return chain
  }
  for (const m of ['select', 'eq', 'is', 'limit']) chain[m] = passthrough(m)
  chain.then = (f: (v: unknown) => unknown) => Promise.resolve(response).then(f)
  const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient
  return { client, calls }
}

const MEMBER = '00000000-0000-0000-0000-000000000001'

describe('hasActiveBusinessGroup', () => {
  it('is true when the Member holds an active business-Group membership', async () => {
    const { client } = stub({ data: [{ group_id: 'g1' }], error: null })
    expect(await hasActiveBusinessGroup(client, MEMBER)).toBe(true)
  })

  it('is false when the Member holds none', async () => {
    const { client } = stub({ data: [], error: null })
    expect(await hasActiveBusinessGroup(client, MEMBER)).toBe(false)
  })

  it('filters to kind=business, active, not-left, for this Member', async () => {
    const { client, calls } = stub({ data: [], error: null })
    await hasActiveBusinessGroup(client, MEMBER)
    const eqs = calls.filter(([n]) => n === 'eq').map(([, a]) => a)
    expect(eqs).toContainEqual(['member_id', MEMBER])
    expect(eqs).toContainEqual(['groups.kind', 'business'])
    expect(eqs).toContainEqual(['groups.lifecycle_state', 'active'])
    expect(calls.filter(([n]) => n === 'is').map(([, a]) => a)).toContainEqual(['left_at', null])
  })

  it('throws on a query error rather than reporting "no Shop"', async () => {
    const { client } = stub({ data: null, error: { message: 'PGRST205' } })
    await expect(hasActiveBusinessGroup(client, MEMBER)).rejects.toThrow(/PGRST205/)
  })
})
