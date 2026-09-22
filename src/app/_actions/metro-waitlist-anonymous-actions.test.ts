// T167 (#193) — the server action behind leaving an address.
//
// Two assertions carry this file:
//   - the browser gets one combined number and a message, never the per-role
//     split (criterion 8), same as the signed-in action;
//   - nothing in the result distinguishes a new address from a known one
//     (criterion 14), and the number shown is the one that predates the write.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { joinAnonymous } = vi.hoisted(() => ({ joinAnonymous: vi.fn() }))

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
  joinAnonymous.mockResolvedValue(handlerResult())
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

  // Ruled 2026-09-22 (#196). Not "the split does not travel" — NO number
  // travels, because any truthful live count leaks membership by differencing.
  it('hands the browser no number of any kind', async () => {
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    })
    expect(Object.keys(result).sort()).toEqual(['message', 'metroName', 'open'])
    expect(JSON.stringify(result)).not.toMatch(
      /creatorThreshold|patronThreshold|creatorCount|patronCount|combined|standing/i,
    )
    // And no digit smuggled into the copy — "247 more people" would be the
    // same leak with better manners.
    expect(result.message).not.toMatch(/\d/)
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
    expect(result.message).toMatch(/one message/i)
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
  })

  it('surfaces a handler refusal as a plain message', async () => {
    joinAnonymous.mockRejectedValue(new ActionError('validation_error', 'nope'))
    await expect(
      joinMetroWaitlistAnonymousAction({ metroId: METRO, email: 'a@b.com', role: 'creator' }),
    ).rejects.toThrow('nope')
  })
})
