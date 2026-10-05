// Issue #231 — a failed save reaches the owner as a sentence.
//
// A server action that throws is redacted by Next in production to "An error
// occurred in the Server Components render…" plus a digest, whatever it said.
// That is what Don saw. So the action returns its failure instead of throwing.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { groupUpdate, groupUpdateDraft, lifecycle } = vi.hoisted(() => ({
  groupUpdate: vi.fn(),
  groupUpdateDraft: vi.fn(),
  lifecycle: { state: 'active', kind: 'interest' },
}))
vi.mock('@/actions', async () => ({
  ActionError: (await import('@/actions/_lib/errors')).ActionError,
  groupUpdate,
  groupUpdateDraft,
}))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'm1' } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { lifecycle_state: lifecycle.state, kind: lifecycle.kind } }) }) }),
    }),
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

describe('#301 — a draft is edited through the draft handler', () => {
  beforeEach(() => {
    groupUpdate.mockReset()
    groupUpdateDraft.mockReset()
    lifecycle.state = 'active'
    lifecycle.kind = 'interest'
  })

  // A shop's name and description live on group_businesses, which the Page
  // reads and group.activate checks; group.update_draft writes them only
  // when named as business fields.
  it("a shop draft's name and description reach its business row", async () => {
    lifecycle.state = 'draft'
    lifecycle.kind = 'business'
    const { editPageAction } = await import('./actions')
    await editPageAction({ ...input, name: 'Oak Park Sourdough', description: 'Bread.' })
    expect(groupUpdateDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Oak Park Sourdough',
        businessDisplayName: 'Oak Park Sourdough',
        description: 'Bread.',
        businessPublicDescription: 'Bread.',
      }),
    )
  })

  it('a draft saves through group.update_draft, with the same fields', async () => {
    lifecycle.state = 'draft'
    const { editPageAction } = await import('./actions')
    const res = await editPageAction({ ...input, name: 'Oak Park Sourdough', description: 'Bread.' })
    expect(res).toEqual({ ok: true })
    expect(groupUpdate).not.toHaveBeenCalled()
    expect(groupUpdateDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ groupId: 'g1', name: 'Oak Park Sourdough', description: 'Bread.' }),
    )
  })

  it('a live Page still saves through group.update', async () => {
    const { editPageAction } = await import('./actions')
    await editPageAction({ ...input, name: 'x' })
    expect(groupUpdate).toHaveBeenCalled()
    expect(groupUpdateDraft).not.toHaveBeenCalled()
  })
})
