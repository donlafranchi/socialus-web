// T137 — findability follows what you've published.
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { memberHasPublished } from './has-published'

function makeSupabase(result: { data: unknown; error?: unknown }) {
  const from = vi.fn()
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = () => Promise.resolve(result)
  from.mockReturnValue(chain)
  return { supabase: { from } as unknown as SupabaseClient, from }
}

describe('memberHasPublished', () => {
  it('is true when the projection carries the Member', async () => {
    const { supabase, from } = makeSupabase({ data: { member_id: 'mem-1' } })
    expect(await memberHasPublished(supabase, 'mem-1')).toBe(true)
    expect(from).toHaveBeenCalledWith('member_public_has_published')
  })

  it('is false when the projection has no row (nothing published — protective default)', async () => {
    const { supabase } = makeSupabase({ data: null })
    expect(await memberHasPublished(supabase, 'mem-1')).toBe(false)
  })

  it('is false on error', async () => {
    const { supabase } = makeSupabase({ data: null, error: { message: 'x' } })
    expect(await memberHasPublished(supabase, 'mem-1')).toBe(false)
  })
})
