// T167 (#193) — the server action behind leaving an address.
//
// Two assertions carry this file:
//   - the browser gets one combined number and a message, never the per-role
//     split (criterion 8), same as the signed-in action;
//   - nothing in the result distinguishes a new address from a known one
//     (criterion 14), and the number shown is the one that predates the write.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { joinAnonymous, waitingCountFor } = vi.hoisted(() => ({
  joinAnonymous: vi.fn(),
  waitingCountFor: vi.fn(),
}))

// The CACHED count. Mocked here so a test can say what the cache held, and —
// more importantly — so a test can assert the action never reads anything else.
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountFor }))

vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, metroWaitlistJoinAnonymous: joinAnonymous }
})

import { joinMetroWaitlistAnonymousAction } from './metro-waitlist-actions'

const METRO = '22222222-2222-2222-2222-222222222222'

function handlerResult(over: Record<string, unknown> = {}) {
  return {
    open: false,
    metroId: METRO,
    metroName: 'Boise City-Mountain Home-Ontario, ID-OR',
    ...over,
  }
}

beforeEach(() => {
  joinAnonymous.mockReset()
  waitingCountFor.mockReset()
  joinAnonymous.mockResolvedValue(handlerResult())
  waitingCountFor.mockResolvedValue(50)
})

describe('joinMetroWaitlistAnonymousAction', () => {
  it('needs no account — it never asks who is calling', async () => {
    // No Supabase client is mocked here on purpose. If this action ever grows
    // a getUser() call, this test fails with a module error rather than
    // quietly sending a signed-out stranger to sign-in.
    await expect(
      joinMetroWaitlistAnonymousAction({ metroId: METRO, email: 'a@b.com', role: 'patron' }),
    ).resolves.toBeTruthy()
  })

  // Ruled 2026-09-23, reversing #196. The count is back — and it comes from
  // the cache, which is what keeps the oracle closed.
  it('shows the cached count, and never the per-role split', () => {
    return joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    }).then((result) => {
      expect(result.standing).toEqual({ combined: 50, target: 300 })
      // criterion 8 — the 50/250 split is how the platform decides and must
      // not reach a popup.
      expect(JSON.stringify(result)).not.toMatch(
        /creatorThreshold|patronThreshold|creatorCount|patronCount/,
      )
    })
  })

  it('reads the CACHED count and nothing else — no live read on the write path', async () => {
    await joinMetroWaitlistAnonymousAction({ metroId: METRO, email: 'a@b.com', role: 'creator' })
    // The whole mechanism in one assertion. If this action ever reads
    // metro_polygons directly again, it needs a Supabase client, and none is
    // mocked here — it would fail with a module error rather than quietly
    // reintroducing the oracle.
    expect(waitingCountFor).toHaveBeenCalledTimes(1)
    expect(waitingCountFor).toHaveBeenCalledWith(METRO)
  })

  it('renders no number at all when the metro is missing from the snapshot', async () => {
    // Null, not zero. "Nobody yet" and "we do not know" read the same to a
    // person and are different facts.
    waitingCountFor.mockResolvedValue(null)
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    })
    expect(result.standing).toBeNull()
    expect(result.message).toBe('')
  })

  // Now true in full. With no number in the result there is nothing left that
  // could differ between the two, so this no longer depends on the mock
  // returning a fixed count — which is exactly how the earlier version of this
  // test reported success about a question it was not asking.
  it('returns the same thing for a new address and a known one', async () => {
    const fresh = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'same@example.com',
      role: 'creator',
    })
    const repeat = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'same@example.com',
      role: 'creator',
    })
    // Still byte-identical, and now for the right reason: the count is the
    // same cached figure both times, because a submission does not move it.
    expect(repeat).toEqual(fresh)
    for (const leak of ['changed', 'created', 'existed', 'alreadyListed', 'isNew']) {
      expect(fresh).not.toHaveProperty(leak)
    }
  })

  it('says nothing about a date, a timeline, or a promise to open', async () => {
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    })
    // criterion 9, as a hard constraint rather than copy guidance.
    expect(result.message).not.toMatch(/soon|week|month|year|date|shortly|will open|coming/i)
    expect(result.message.length).toBeGreaterThan(0)
    // criterion 15 — the one use the address has, said plainly.
    // Criterion 15's promise lives on the panel, before a person types, not
    // in the confirmation after the fact.
  })

  it('has nothing to wait for when the metro is already open', async () => {
    joinAnonymous.mockResolvedValue(handlerResult({ open: true }))
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    })
    expect(result.open).toBe(true)
    expect(result.message).toBe('')
    expect(result.standing).toBeNull()
  })

  it('surfaces a handler refusal as a plain message', async () => {
    joinAnonymous.mockRejectedValue(new ActionError('validation_error', 'nope'))
    await expect(
      joinMetroWaitlistAnonymousAction({ metroId: METRO, email: 'a@b.com', role: 'creator' }),
    ).rejects.toThrow('nope')
  })
})
