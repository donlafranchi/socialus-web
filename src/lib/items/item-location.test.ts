import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { itemLocationLabel } from './item-location'

// F093 criterion 8 (amended 2026-09-30): a signed-out caller is sent no
// location. An item's location is read on its own, as the caller, so a
// refusal leaves the item standing without one instead of failing its page.

function client(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) chain[m] = () => chain
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return { from: () => chain } as unknown as SupabaseClient
}

describe('itemLocationLabel', () => {
  it("is the first active location's label", async () => {
    const c = client({
      data: [
        { removed_at: '2026-01-01', locations: { label: 'Old stall' } },
        { removed_at: null, locations: { label: "Maya's Kitchen" } },
      ],
      error: null,
    })
    expect(await itemLocationLabel(c, 'item-1')).toBe("Maya's Kitchen")
  })

  it('is null when the caller may not read locations (signed out)', async () => {
    const c = client({ data: null, error: { message: 'permission denied for table locations' } })
    expect(await itemLocationLabel(c, 'item-1')).toBeNull()
  })
})
