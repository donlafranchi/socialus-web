// T160 (Issue #62) — the server action wrapping report.create.
//
// Same shape as saved-search-actions.test.ts: auth gate, input pass-through,
// ActionError→Error wrapping. The row-level behaviour (limits, the hide, the
// events) is T159's and is tested there.
//
// The assertion worth guarding: the action returns `{ ok: true }` and nothing
// else. `report.create` also returns `photoHidden`, and passing that back to
// the browser would tell a reporter that a Page is already reported, already
// locked, or that they have hit their own cap — which F058 acceptance 2 forbids.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionError } from '@/actions/_lib/errors'

const { getUser, create } = vi.hoisted(() => ({
  getUser: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

vi.mock('@/actions', async (importActual) => {
  const actual = await importActual<typeof import('@/actions')>()
  return { ...actual, reportCreate: create }
})

import { sendReportAction } from './report-actions'

const MEMBER = '11111111-1111-1111-1111-111111111111'
const GROUP = '22222222-2222-2222-2222-222222222222'

function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
}
function anon() {
  getUser.mockResolvedValue({ data: { user: null }, error: null })
}

beforeEach(() => {
  getUser.mockReset()
  create.mockReset()
  create.mockResolvedValue({ reportId: 'rep-1', photoHidden: true })
})

describe('sendReportAction', () => {
  it('refuses an anonymous caller before touching the handler', async () => {
    anon()
    await expect(sendReportAction({ subjectId: GROUP, category: 'spam', body: 'x' })).rejects.toThrow(
      /signed in/i,
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('passes the subject and the body through as a group report', async () => {
    signedIn()
    await sendReportAction({ subjectId: GROUP, category: 'spam', body: 'this photo is stolen' })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ actingMemberId: MEMBER }),
      { subjectKind: 'group', category: 'spam', subjectId: GROUP, body: 'this photo is stolen' },
    )
  })

  it('returns ok and nothing else — never whether the photo was hidden', async () => {
    signedIn()
    const result = await sendReportAction({ subjectId: GROUP, category: 'spam', body: 'x' })
    expect(result).toEqual({ ok: true })
    expect(JSON.stringify(result)).not.toMatch(/photoHidden|hidden|rep-1/i)
  })

  it('surfaces an ActionError as a plain Error the component can show', async () => {
    signedIn()
    create.mockRejectedValue(new ActionError('validation_error', 'body must not be empty'))
    await expect(sendReportAction({ subjectId: GROUP, category: 'spam', body: '  ' })).rejects.toThrow(
      /body must not be empty/,
    )
  })
})

// F099 criterion 8 — an image is named by what it is.
describe('sendReportAction — which image', () => {
  it('defaults to the Page photo, as it always did', async () => {
    signedIn()
    await sendReportAction({ subjectId: GROUP, category: 'spam', body: 'x' })
    expect(create.mock.calls[0]![1]).toMatchObject({ subjectKind: 'group', subjectId: GROUP })
  })

  // [guards F099.8]
  it.each(['post_photo', 'page_picture'] as const)('passes %s through', async (subjectKind) => {
    signedIn()
    await sendReportAction({ subjectKind, subjectId: GROUP, category: 'spam', body: 'x' })
    expect(create.mock.calls[0]![1]).toMatchObject({ subjectKind, subjectId: GROUP })
  })
})
