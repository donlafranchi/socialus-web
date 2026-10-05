// #301 — Start makes a kind-only draft and lands on it.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, groupCreate, redirect, single } = vi.hoisted(() => ({
  getUser: vi.fn(),
  groupCreate: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`)
  }),
  single: vi.fn(),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (o: unknown) => o }))
vi.mock('@/actions', () => ({ groupCreate, groupActivate: vi.fn(), ActionError: class extends Error {} }))

import { startDraftAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'm-1' } } })
  groupCreate.mockResolvedValue({ groupId: 'g-1', slug: 'draft-a1b2', lifecycleState: 'draft' })
  single.mockResolvedValue({ data: { slug: 'draft-a1b2', public_id: 'x7k2m9' } })
})

describe('#301 — startDraftAction', () => {
  it('creates a draft of the chosen kind, with nothing else, and lands on it', async () => {
    await expect(startDraftAction('event_anchored')).rejects.toThrow('REDIRECT /g/draft-a1b2-x7k2m9')
    expect(groupCreate).toHaveBeenCalledWith(expect.anything(), { kind: 'event_anchored', founderMemberId: 'm-1' })
  })

  it('refuses a kind it does not offer', async () => {
    await expect(startDraftAction('family' as never)).rejects.toThrow()
    expect(groupCreate).not.toHaveBeenCalled()
  })

  it('sends someone signed out to sign in, and back here', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(startDraftAction('business')).rejects.toThrow('REDIRECT /auth/login?next=%2Fcreate')
  })
})
