// #443 — the server action behind "Report a problem".

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getUser, problemReport, headers } = vi.hoisted(() => ({ getUser: vi.fn(), problemReport: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/action-context', () => ({ resolveActionContext: (o: unknown) => o }))
vi.mock('@/actions', () => ({ problemReport, ActionError: class extends Error {} }))
vi.mock('next/headers', () => ({ headers }))

import { reportProblemAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  headers.mockResolvedValue(new Headers({ 'user-agent': 'Mozilla/5.0 test' }))
  problemReport.mockResolvedValue({ reportId: 'r1' })
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '0b26c0d9f1')
})

describe('reportProblemAction', () => {
  it('sends the description, the path, the browser and the build to the handler', async () => {
    await expect(reportProblemAction({ description: 'It broke', route: '/g/abc' })).resolves.toEqual({ ok: true })
    expect(problemReport).toHaveBeenCalledWith(
      { actingMemberId: 'me' },
      { description: 'It broke', route: '/g/abc', userAgent: 'Mozilla/5.0 test', buildSha: '0b26c0d9f1' },
    )
  })

  it('a bot that fills the hidden field is told thanks and nothing is written', async () => {
    await expect(reportProblemAction({ description: 'buy now', route: '/', website: 'http://spam' })).resolves.toEqual({ ok: true })
    expect(problemReport).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(reportProblemAction({ description: 'x', route: '/' })).resolves.toMatchObject({ ok: false })
    expect(problemReport).not.toHaveBeenCalled()
  })

  it('turns a refused report (rate limit, empty) into a plain message, never a thrown error', async () => {
    problemReport.mockRejectedValue(Object.assign(new Error('too many reports just now'), { name: 'ValidationError' }))
    const res = await reportProblemAction({ description: 'x', route: '/' })
    expect(res).toMatchObject({ ok: false })
    expect((res as { message: string }).message).toMatch(/try again/i)
  })
})
