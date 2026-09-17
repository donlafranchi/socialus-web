import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// T122 (#12) — report.restore and report.remove.
//
// The authorization tests are the point. This is the project's first
// operator-privileged write, and the pattern it sets is "the handler decides" —
// so the tests that matter most are the ones proving a non-operator is refused
// even when they own the Page, and that an unset env authorises nobody.

type QueryCall = [string, unknown[]?]

interface EventRow {
  group_id: string
  event_kind: string
  payload?: Record<string, unknown>
}

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn<
    (ctx: unknown, table: string, row: EventRow) => Promise<void>
  >(async () => undefined),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { reportRestore, reportRemove } from './review'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const OPERATOR = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const REPORT_ID = '33333333-3333-3333-3333-333333333333'
const GROUP_ID = '44444444-4444-4444-4444-444444444444'
const PHOTO = 'https://cdn.example.test/pages/oak-park.jpg'
const NOW = new Date('2026-09-17T12:00:00Z')

function ctx(actingMemberId: string | null = OPERATOR): ActionContext {
  return {
    actingMemberId: actingMemberId as string,
    viaDelegationId: null,
    traceId: 'trace-1',
    db: {} as never,
    now: () => NOW,
  }
}

function install(opts: { found?: boolean; reviewedAt?: Date | null; photoUrl?: string | null } = {}) {
  const { found = true, reviewedAt = null, photoUrl = PHOTO } = opts
  query.mockImplementation(async (sql: string) => {
    if (/from public\.reports r/.test(sql)) {
      return {
        rows: found
          ? [{ group_id: GROUP_ID, photo_url: photoUrl, photo_hidden_at: NOW, reviewed_at: reviewedAt }]
          : [],
      }
    }
    return { rows: [] }
  })
}

function sqlMatching(re: RegExp): QueryCall[] {
  return (query.mock.calls as QueryCall[]).filter(([s]) => re.test(s))
}

const ORIGINAL_ENV = process.env.OPERATOR_MEMBER_ID

beforeEach(() => {
  query.mockReset()
  appendEvent.mockClear()
  process.env.OPERATOR_MEMBER_ID = OPERATOR
})
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.OPERATOR_MEMBER_ID
  else process.env.OPERATOR_MEMBER_ID = ORIGINAL_ENV
})

describe('only the operator may review — absence of a button is not authorization', () => {
  for (const [name, handler] of [
    ['report.restore', reportRestore],
    ['report.remove', reportRemove],
  ] as const) {
    it(`${name} refuses an ordinary member`, async () => {
      install()
      await expect(handler(ctx(OWNER), { reportId: REPORT_ID })).rejects.toBeInstanceOf(
        AuthorizationError,
      )
      expect(query).not.toHaveBeenCalled()
    })

    it(`${name} refuses the Page's own owner`, async () => {
      install()
      // The owner has every right to their Page and none to this decision.
      await expect(handler(ctx(OWNER), { reportId: REPORT_ID })).rejects.toBeInstanceOf(
        AuthorizationError,
      )
    })

    it(`${name} refuses everyone when OPERATOR_MEMBER_ID is unset`, async () => {
      delete process.env.OPERATOR_MEMBER_ID
      install()
      await expect(handler(ctx(OPERATOR), { reportId: REPORT_ID })).rejects.toBeInstanceOf(
        AuthorizationError,
      )
    })

    it(`${name} says the same thing either way — it never reveals the report exists`, async () => {
      install({ found: false })
      const err = await handler(ctx(OWNER), { reportId: REPORT_ID }).catch((e) => e)
      expect(err.message).toBe(`${name}: not permitted`)
    })
  }
})

describe('restore', () => {
  it('clears the hide and takes out the sticky lock against the current photo', async () => {
    install()
    const out = await reportRestore(ctx(), { reportId: REPORT_ID })
    expect(out.outcome).toBe('restored')
    expect(out.removedPhotoUrl).toBeNull()

    const [sql] = sqlMatching(/update public\.groups/)[0]!
    expect(sql).toContain('photo_hidden_at = null')
    // Against photo_url, not a literal: replacing the photo drops the lock.
    expect(sql).toContain('photo_hide_locked_url = photo_url')
  })

  it('records who reviewed it and when', async () => {
    install()
    await reportRestore(ctx(), { reportId: REPORT_ID })
    const [, params] = sqlMatching(/update public\.reports/)[0]!
    expect(params).toEqual([REPORT_ID, NOW, OPERATOR])
  })

  it('writes the audit event naming the reviewer', async () => {
    install()
    await reportRestore(ctx(), { reportId: REPORT_ID })
    const ev = appendEvent.mock.calls.find((c) => (c[2] as EventRow).event_kind === 'group.photo_restored')
    expect(ev).toBeDefined()
    expect((ev![2] as EventRow).payload).toMatchObject({ report_id: REPORT_ID, reviewed_by: OPERATOR })
  })
})

describe('remove', () => {
  it('nulls the photo so every read path loses it at once', async () => {
    install()
    const out = await reportRemove(ctx(), { reportId: REPORT_ID })
    expect(out.outcome).toBe('removed')
    const [sql] = sqlMatching(/update public\.groups/)[0]!
    expect(sql).toContain('photo_url = null')
    expect(sql).toContain('photo_hidden_at = null')
    expect(sql).toContain('photo_hide_locked_url = null')
  })

  // The object is deleted after the commit, so the caller needs the URL back.
  it('hands back the URL it removed, for the storage delete that follows', async () => {
    install()
    const out = await reportRemove(ctx(), { reportId: REPORT_ID })
    expect(out.removedPhotoUrl).toBe(PHOTO)
  })

  it('writes the audit event naming the reviewer', async () => {
    install()
    await reportRemove(ctx(), { reportId: REPORT_ID })
    const ev = appendEvent.mock.calls.find((c) => (c[2] as EventRow).event_kind === 'group.photo_removed')
    expect((ev![2] as EventRow).payload).toMatchObject({ report_id: REPORT_ID, reviewed_by: OPERATOR })
  })
})

describe('a report is reviewed once', () => {
  it('refuses a second review rather than overwriting the first decision', async () => {
    install({ reviewedAt: new Date('2026-09-16T00:00:00Z') })
    await expect(reportRemove(ctx(), { reportId: REPORT_ID })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('reports a missing report as missing, to the operator only', async () => {
    install({ found: false })
    await expect(reportRestore(ctx(), { reportId: REPORT_ID })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
