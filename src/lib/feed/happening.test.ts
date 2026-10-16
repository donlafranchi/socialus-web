// #791 — Explore's three "happening" rows in one read. Today and this week start
// at the same moment, so today is the front of this week's soonest-first list;
// the weekend starts later and comes back as its own bucket of the same call.
import { describe, it, expect, vi } from 'vitest'
import { getHappening } from './browse-feed'

const row = (id: string, starts: string, bucket: 'week' | 'weekend', updated = '2026-10-01T00:00:00Z') => ({
  bucket, result_kind: 'post', result_id: id, group_id: 'g1', group_kind: 'business', slug: 's', name: 'N',
  place_path: null, photo_url: null, photo_hidden_at: null, photo_removed_at: null, description: null, body: 'b',
  tags: [], starts_at: starts, location_id: null, location_label: null, location_geography: null,
  page_created_at: '2026-09-01T00:00:00Z', updated_at: updated, sort_at: starts, posted_at: '2026-09-30T00:00:00Z',
})

const WINDOWS = {
  today: { from: '2026-10-16T18:00:00.000Z', to: '2026-10-17T07:00:00.000Z' },
  thisWeek: { from: '2026-10-16T18:00:00.000Z', to: '2026-10-20T07:00:00.000Z' },
  thisWeekend: { from: '2026-10-18T07:00:00.000Z', to: '2026-10-20T07:00:00.000Z' },
}

function client(rows: unknown[]) {
  const rpc = vi.fn(async () => ({ data: rows, error: null }))
  const from = vi.fn(() => ({ select: () => ({ in: async () => ({ data: [{ id: 'g1', public_id: 'abc123' }], error: null }) }) }))
  return { supabase: { rpc, from } as never, rpc, from }
}

describe('getHappening', () => {
  it('asks once, for the week and the weekend, soonest first', async () => {
    const { supabase, rpc } = client([])
    await getHappening(supabase, { metroId: 'm-1' }, WINDOWS, 20)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('browse_happening', {
      p_metro_id: 'm-1', p_place_id: null, p_from: WINDOWS.thisWeek.from,
      p_weekend_from: WINDOWS.thisWeekend.from, p_before: WINDOWS.thisWeek.to, p_limit: 20,
    })
  })
  it('today is the week rows before tonight; each bucket keeps soonest-first order', async () => {
    const { supabase } = client([
      row('w2', '2026-10-18T19:00:00Z', 'week'),
      row('w1', '2026-10-16T20:00:00Z', 'week'),
      row('e1', '2026-10-18T19:00:00Z', 'weekend'),
    ])
    const out = await getHappening(supabase, { metroId: 'm-1' }, WINDOWS, 20)
    expect(out.thisWeek.map((r) => r.resultId)).toEqual(['w1', 'w2'])
    expect(out.today.map((r) => r.resultId)).toEqual(['w1'])
    expect(out.thisWeekend.map((r) => r.resultId)).toEqual(['e1'])
  })
  it('a read error throws, so a broken row is not mistaken for an empty one', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('boom') }))
    await expect(getHappening({ rpc, from: vi.fn() } as never, { metroId: 'm-1' }, WINDOWS, 20)).rejects.toThrow('boom')
  })
})
