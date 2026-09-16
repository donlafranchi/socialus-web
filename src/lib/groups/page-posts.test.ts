import { describe, it, expect, vi } from 'vitest'
import { resolvePagePosts } from './page-posts'
import type { SupabaseClient } from '@supabase/supabase-js'

function client(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {}
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((...a: unknown[]) => { calls.eq = a; return chain }),
    order: vi.fn((...a: unknown[]) => { calls.order = a; return chain }),
    limit: vi.fn(async () => result),
  }
  return {
    supabase: { from: vi.fn(() => chain) } as unknown as SupabaseClient,
    chain,
    calls,
  }
}

describe('resolvePagePosts', () => {
  it('returns posts newest first, as the caller names them', async () => {
    const { supabase, calls } = client({
      data: [
        { id: 'a', body: 'Sourdough is back Thursday.', created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-15T10:00:00Z' },
      ],
      error: null,
    })
    const posts = await resolvePagePosts(supabase, 'g1')
    expect(posts).toEqual([
      { id: 'a', body: 'Sourdough is back Thursday.', createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T10:00:00Z' },
    ])
    expect(calls.order).toEqual(['created_at', { ascending: false }])
  })

  it('adds no visibility filter of its own — RLS is the single answer', async () => {
    const { supabase, chain } = client({ data: [], error: null })
    await resolvePagePosts(supabase, 'g1')
    const eqArgs = chain.eq.mock.calls.map((c) => c[0])
    expect(eqArgs).toEqual(['group_id'])
  })

  it('yields no posts when the read fails, rather than throwing', async () => {
    const { supabase } = client({ data: null, error: { message: 'nope' } })
    await expect(resolvePagePosts(supabase, 'g1')).resolves.toEqual([])
  })
})
