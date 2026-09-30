// T109 — Unit tests for the listed-member-count reader (F042).
// Trace: T109 "Counts respect privacy"; scenario-F042 § "Counts respect privacy gates".
//
// #246 — the count comes from page_listed_member_counts, a function that
// returns a number per Page and never the rows behind it. The projection it
// used to read answers nobody now, since it named every member of a Page.

import { describe, it, expect, vi } from 'vitest'
import { getListedMemberCounts } from './get-listed-member-counts'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeClient(rows: { group_id: string; members: number }[]) {
  const rpc = vi.fn(() => Promise.resolve({ data: rows, error: null }))
  const from = vi.fn()
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from }
}

describe('getListedMemberCounts', () => {
  it('reads counts per Page, and no roster', async () => {
    const { client, rpc, from } = makeClient([
      { group_id: 'g1', members: 2 },
      { group_id: 'g2', members: 1 },
    ])
    expect(await getListedMemberCounts(client, ['g1', 'g2'])).toEqual({ g1: 2, g2: 1 })
    expect(rpc).toHaveBeenCalledWith('page_listed_member_counts', { p_group_ids: ['g1', 'g2'] })
    expect(from).not.toHaveBeenCalled()
  })

  it('returns an empty map for no group ids (no query)', async () => {
    const { client, rpc } = makeClient([])
    expect(await getListedMemberCounts(client, [])).toEqual({})
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports zero implicitly (a Page with no listed rows is simply absent)', async () => {
    const { client } = makeClient([{ group_id: 'g1', members: 1 }])
    const counts = await getListedMemberCounts(client, ['g1', 'g2'])
    expect(counts.g1).toBe(1)
    expect(counts.g2 ?? 0).toBe(0)
  })
})
