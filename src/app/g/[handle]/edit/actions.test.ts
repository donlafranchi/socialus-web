// Issue #231 — a failed save reaches the owner as a sentence.
//
// A server action that throws is redacted by Next in production to "An error
// occurred in the Server Components render…" plus a digest, whatever it said.
// That is what Don saw. So the action returns its failure instead of throwing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { groupUpdate } = vi.hoisted(() => ({ groupUpdate: vi.fn() }))
vi.mock('@/actions', async () => ({
  ActionError: (await import('@/actions/_lib/errors')).ActionError,
  groupUpdate,
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'm1' } }, error: null }) },
  }),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const input = { groupId: 'g1', pagePath: '/g/x-1', socialLinks: { instagram: 'https://instagram.com/x' } }

describe('editPageAction', () => {
  beforeEach(() => groupUpdate.mockReset())

  it("returns the handler's own message rather than throwing it", async () => {
    groupUpdate.mockRejectedValueOnce(
      new ActionError('validation_error', 'these links could not be read: instagram'),
    )
    const { editPageAction } = await import('./actions')
    await expect(editPageAction(input)).resolves.toEqual({
      ok: false,
      message: 'these links could not be read: instagram',
    })
  })

  it('returns a plain sentence, not the database error, when something else broke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    groupUpdate.mockRejectedValueOnce(new Error('invalid regular expression: invalid repetition count(s)'))
    const { editPageAction } = await import('./actions')
    const result = await editPageAction(input)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/didn.t save/i)
    expect(result.ok === false && result.message).not.toMatch(/regular expression/)
  })

  it('says ok when it saved', async () => {
    groupUpdate.mockResolvedValueOnce({})
    const { editPageAction } = await import('./actions')
    await expect(editPageAction(input)).resolves.toEqual({ ok: true })
  })
})
