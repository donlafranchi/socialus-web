import { describe, it, expect, vi, beforeEach } from 'vitest'

// #1299 — the finish reads the same for a new address and one already waiting (F076.14), and nothing runs with the flag off.

const { join, flag } = vi.hoisted(() => ({ join: vi.fn(), flag: vi.fn() }))
vi.mock('@/lib/flags/check', () => ({ flagOn: flag }))
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountFor: vi.fn(async () => 42) }))
vi.mock('@/lib/action-context', () => ({ resolveAnonymousActionContext: () => ({}) }))
vi.mock('@/lib/supabase-anon', () => ({ createAnonClient: vi.fn() }))
vi.mock('@/actions', () => ({ metroWaitlistJourneyJoin: join, ActionError: class extends Error {} }))

import { joinWaitlistJourneyAction } from './waitlist-journey-actions'

const answers = { plans: ['find-events'], kinds: [], offerName: '', offerLink: '', name: 'Sam', zip: '95814', email: 'sam@example.com', phone: '(916) 555-0142' }

describe('joinWaitlistJourneyAction', () => {
  beforeEach(() => {
    flag.mockResolvedValue(true)
    join.mockClear()
    join.mockResolvedValue({ metroId: 'm1', marketName: 'Sacramento' })
  })

  // [guards F076.14 partial: the handler against a real database]
  it('answers a new address and a known one identically, with the cached count', async () => {
    const first = await joinWaitlistJourneyAction(answers)
    const again = await joinWaitlistJourneyAction(answers)
    expect(first).toEqual({ ok: true, market: 'Sacramento', waiting: 42 })
    expect(again).toEqual(first)
  })

  it('does nothing while the flag is off', async () => {
    flag.mockResolvedValue(false)
    expect(await joinWaitlistJourneyAction(answers)).toEqual({ ok: false, step: null })
    expect(join).not.toHaveBeenCalled()
  })

  it('sends a bad answer back to its own screen, and survives malformed input', async () => {
    expect(await joinWaitlistJourneyAction({ ...answers, zip: '9581' })).toEqual({ ok: false, step: 'zip' })
    expect(await joinWaitlistJourneyAction({ ...answers, phone: '555' })).toEqual({ ok: false, step: 'phone' })
    expect(await joinWaitlistJourneyAction({ ...answers, plans: 'x' as unknown as string[] })).toEqual({ ok: false, step: 'plans' })
  })
})
