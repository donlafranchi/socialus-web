// T163 (#77) — the server action behind the waitlist step.
//
// The assertion that matters: what comes back to the browser is one combined
// number and a message. The per-role split is how the platform decides
// (criterion 10) and must not travel to the client, because the popup showing
// it is exactly what criterion 8 forbids.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { getUser, join, from, waitingCountFor } = vi.hoisted(() => ({
  getUser: vi.fn(),
  join: vi.fn(),
  from: vi.fn(),
  waitingCountFor: vi.fn(),
}))

// F076 criteria 7 and 8: the signed-in popup shows the CACHED figure, the same
// one the anonymous popup shows.
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountFor }))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}))

vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, metroWaitlistJoin: join }
})

import { joinMetroWaitlistAction } from './metro-waitlist-actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const METRO = '22222222-2222-2222-2222-222222222222'

function metroRow(over: Record<string, unknown> = {}) {
  const row = {
    id: METRO,
    name: 'Boise City-Mountain Home-Ontario, ID-OR',
    is_open: false,
    creator_count: 10,
    patron_count: 40,
    creator_threshold: 50,
    patron_threshold: 250,
    ...over,
  }
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
  })
  return row
}

beforeEach(() => {
  getUser.mockReset()
  join.mockReset()
  from.mockReset()
  waitingCountFor.mockReset()
  waitingCountFor.mockResolvedValue(50)
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
  join.mockResolvedValue({ metroId: METRO, role: 'creator', changed: true })
})

describe('joinMetroWaitlistAction', () => {
  it('refuses an anonymous caller before touching the handler', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    metroRow()
    await expect(
      joinMetroWaitlistAction({ metroId: METRO, role: 'creator' }),
    ).rejects.toThrow(/signed in/i)
    expect(join).not.toHaveBeenCalled()
  })

  it('passes the metro and role through', async () => {
    metroRow()
    await joinMetroWaitlistAction({ metroId: METRO, role: 'patron' })
    expect(join).toHaveBeenCalledWith(
      expect.objectContaining({ actingMemberId: MEMBER }),
      { metroId: METRO, role: 'patron' },
    )
  })

  it('returns one combined number and a message — never the split', async () => {
    metroRow()
    const res = await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(res.standing).toEqual({ combined: 50, target: 300 })
    expect(res.standing).not.toBeNull()
    // Asserted on the SHAPE, not on digits. "50" and "250" appear in this
    // response for honest reasons — 50 is the combined count and 250 is how
    // many more people are needed — so scanning for them finds the arithmetic,
    // not a leak. The leak would be a per-role field, and an exact key set is
    // what catches one being added later.
    expect(Object.keys(res).sort()).toEqual(['message', 'metroName', 'open', 'standing'])
    expect(Object.keys(res.standing!).sort()).toEqual(['combined', 'target'])
    const json = JSON.stringify(res)
    for (const leak of ['creatorCount', 'patronCount', 'creatorThreshold', 'patronThreshold', 'eligible']) {
      expect(json).not.toContain(leak)
    }
  })

  // [guards F076.7 partial: the signed-in popup; the anonymous popup is in metro-waitlist-anonymous-actions.test.ts]
  // [guards F076.8 partial: the signed-in popup shows the cached figure; the picker's ordering is guarded separately]
  it('shows the cached figure, not a count read after the write', async () => {
    // The live rows say 51; the cache holds 47. The popup must show the cache,
    // so it can never differ from what the metro picker orders by.
    metroRow({ creator_count: 11, patron_count: 40 })
    waitingCountFor.mockResolvedValue(47)
    const res = await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(waitingCountFor).toHaveBeenCalledWith(METRO)
    expect(res.standing).toEqual({ combined: 47, target: 300 })
  })

  it('reads the metro row once, before the write, and never for a count afterwards', async () => {
    metroRow()
    await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('shows no number rather than a confident zero when the cache has no entry', async () => {
    metroRow()
    waitingCountFor.mockResolvedValue(null)
    const res = await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(res.standing).toBeNull()
    expect(res.message).toBe('')
  })

  it('carries the metro name so the popup can name where they are waiting', async () => {
    metroRow()
    const res = await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(res.metroName).toBe('Boise City-Mountain Home-Ontario, ID-OR')
  })

  it('reports an open metro as needing no waitlist at all', async () => {
    metroRow({ is_open: true })
    const res = await joinMetroWaitlistAction({ metroId: METRO, role: 'creator' })
    expect(res.open).toBe(true)
    expect(join).not.toHaveBeenCalled()
  })

  it('surfaces an ActionError as a plain Error', async () => {
    metroRow()
    join.mockRejectedValue(new ActionError('not_found_error', 'metro not found'))
    await expect(
      joinMetroWaitlistAction({ metroId: METRO, role: 'creator' }),
    ).rejects.toThrow(/metro not found/)
  })
})
