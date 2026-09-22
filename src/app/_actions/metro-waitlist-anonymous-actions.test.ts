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
    creatorCount: 10,
    patronCount: 40,
    creatorThreshold: 50,
    patronThreshold: 250,
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

  it('hands the browser one combined number, never the split', async () => {
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'a@b.com',
      role: 'creator',
    })
    expect(result.standing).toEqual({ combined: 50, target: 300 })
    // criterion 8 — the 50/250 split is how the platform decides, and must not
    // travel to a popup.
    const serialised = JSON.stringify(result)
    expect(serialised).not.toMatch(/creatorThreshold|patronThreshold|creatorCount|patronCount/)
  })

  it('shows the count as it stood before the write', async () => {
    // The handler returns pre-write counts by construction; the action must
    // pass them through rather than reading the metro again afterwards.
    joinAnonymous.mockResolvedValue(handlerResult({ creatorCount: 10, patronCount: 40 }))
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'new@example.com',
      role: 'creator',
    })
    expect(result.standing.combined).toBe(50)
  })

  // The SHAPE carries no tell. The COUNT still does — see #196 and the note at
  // the top of waitlist-join-anonymous.ts. Asserting `repeat).toEqual(fresh)`
  // here would pass only because the handler is mocked to a fixed count, which
  // is how the original version of this test reported success about a question
  // it was not asking.
  it('carries no flag that distinguishes a new address from a known one', async () => {
    const result = await joinMetroWaitlistAnonymousAction({
      metroId: METRO,
      email: 'same@example.com',
      role: 'creator',
    })
    for (const leak of ['changed', 'created', 'existed', 'alreadyListed', 'isNew']) {
      expect(result).not.toHaveProperty(leak)
    }
    expect(Object.keys(result).sort()).toEqual(['message', 'metroName', 'open', 'standing'])
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
