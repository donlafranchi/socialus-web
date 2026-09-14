import { describe, it, expect, vi, beforeEach } from 'vitest'

// T159 (Issue #61) — report.create. The server half of "hidden immediately on
// flag": one handler, the three limits that keep it from being a griefing
// weapon, and nothing whatsoever rendered to anyone as a result.
//
// The limits, in the ticket's words:
//   1. One auto-hide per member per subject.
//   2. A restore is sticky (photo_hide_locked_url = photo_url).
//   3. A cap on open auto-hides per reporter (5 unreviewed; the 6th stores
//      and queues but does not hide).
// Every one of them stores the report. None of them ever refuses a report.

type QueryCall = [string, unknown[]?]

interface EventRow {
  group_id: string
  event_kind: string
  payload?: Record<string, unknown>
}

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn<
    (
      ctx: unknown,
      table: string,
      row: { event_kind: string; payload?: Record<string, unknown> },
    ) => Promise<void>
  >(async () => undefined),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof query }) => unknown) =>
    fn({ query }),
  ),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { reportCreate } from './create'
import { AuthorizationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP_ID = '11111111-1111-1111-1111-111111111111'
const REPORTER_ID = '22222222-2222-2222-2222-222222222222'
const REPORT_ID = '33333333-3333-3333-3333-333333333333'
const PHOTO = 'https://cdn.example.test/pages/oak-park.jpg'
const NOW = new Date('2026-09-14T12:00:00Z')

function ctx(actingMemberId: string = REPORTER_ID): ActionContext {
  return {
    actingMemberId,
    viaDelegationId: null,
    traceId: 'trace-1',
    db: {} as never,
    now: () => NOW,
  }
}

function callsMatching(pattern: RegExp): QueryCall[] {
  return (query.mock.calls as QueryCall[]).filter(([sql]) => pattern.test(sql))
}

function eventsOfKind(kind: string) {
  return appendEvent.mock.calls.filter((c) => (c[2] as EventRow).event_kind === kind)
}

// Routes by SQL shape rather than call order, matching activate.test.ts.
function installQueryRouter(
  opts: {
    groupExists?: boolean
    photoUrl?: string | null
    photoHiddenAt?: Date | null
    photoHideLockedUrl?: string | null
    priorReportsBySameMember?: number
    openReportsByReporter?: number
  } = {},
) {
  const {
    groupExists = true,
    photoUrl = PHOTO,
    photoHiddenAt = null,
    photoHideLockedUrl = null,
    priorReportsBySameMember = 0,
    openReportsByReporter = 0,
  } = opts

  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/i.test(sql) && /select/i.test(sql)) {
      return {
        rows: groupExists
          ? [
              {
                id: GROUP_ID,
                photo_url: photoUrl,
                photo_hidden_at: photoHiddenAt,
                photo_hide_locked_url: photoHideLockedUrl,
              },
            ]
          : [],
      }
    }
    if (/count/i.test(sql) && /reporter_member_id/i.test(sql) && /subject_id/i.test(sql)) {
      return { rows: [{ count: String(priorReportsBySameMember) }] }
    }
    if (/count/i.test(sql) && /reviewed_at is null/i.test(sql)) {
      return { rows: [{ count: String(openReportsByReporter) }] }
    }
    if (/insert into public\.reports/i.test(sql)) {
      return { rows: [{ id: REPORT_ID }] }
    }
    if (/update public\.groups/i.test(sql) && /photo_hidden_at/i.test(sql)) {
      return { rows: [{ id: GROUP_ID }] }
    }
    throw new Error(`unexpected query in test: ${sql}`)
  })
}

beforeEach(() => {
  appendEvent.mockClear()
})

describe('report.create — the happy path', () => {
  it('stores the report, writes group.reported, and hides the photo at once', async () => {
    installQueryRouter()
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'This photo does not belong on a neighbourhood app.',
    })

    expect(result).toEqual({ reportId: REPORT_ID, photoHidden: true })

    const [insert] = callsMatching(/insert into public\.reports/i)
    expect(insert).toBeDefined()
    expect(insert![1]).toContain(REPORTER_ID)
    expect(insert![1]).toContain(GROUP_ID)

    expect(eventsOfKind('group.reported')).toHaveLength(1)
    expect(eventsOfKind('group.photo_hidden')).toHaveLength(1)

    const [hide] = callsMatching(/update public\.groups/i)
    expect(hide).toBeDefined()
    expect(hide![1]).toContain(NOW)
  })

  it('trims the body before storing it', async () => {
    installQueryRouter()
    await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: '   it is a stolen photo   ',
    })
    const [insert] = callsMatching(/insert into public\.reports/i)
    expect(insert![1]).toContain('it is a stolen photo')
  })

  it('rejects a body that is only whitespace', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: '     ' }),
    ).rejects.toThrow()
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })

  it('stores repeat reports as separate rows', async () => {
    installQueryRouter({ priorReportsBySameMember: 1, photoHiddenAt: new Date() })
    await reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'again' })
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
  })

  it('rejects a report against a Page that does not exist', async () => {
    installQueryRouter({ groupExists: false })
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' }),
    ).rejects.toThrow(/not found/i)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })
})

describe('report.create — sign-in required', () => {
  it('rejects the self-bootstrap sentinel', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx('self-bootstrap'), {
        subjectKind: 'group',
        subjectId: GROUP_ID,
        body: 'x',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })

  it('rejects an empty acting member — anonymous reporting is out of v1', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(''), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })
})

describe('report.create — the three limits', () => {
  it('limit 1: a second report by the same member on the same Page stores but does not re-hide', async () => {
    installQueryRouter({ priorReportsBySameMember: 1 })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'still bad',
    })

    expect(result.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
    expect(callsMatching(/update public\.groups/i)).toHaveLength(0)
    expect(eventsOfKind('group.reported')).toHaveLength(1)
    expect(eventsOfKind('group.photo_hidden')).toHaveLength(0)
  })

  it('limit 2: a restored Page stores the report but never auto-hides again', async () => {
    installQueryRouter({ photoHideLockedUrl: PHOTO })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'I still object',
    })

    expect(result.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
    expect(callsMatching(/update public\.groups/i)).toHaveLength(0)
  })

  it('limit 2: the lock dies with the photo it was granted for — a replaced photo hides again', async () => {
    installQueryRouter({ photoHideLockedUrl: 'https://cdn.example.test/pages/OLD.jpg' })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'the new one is worse',
    })
    expect(result.photoHidden).toBe(true)
  })

  it('limit 3: the 6th open report by one reporter stores and queues but does not hide', async () => {
    installQueryRouter({ openReportsByReporter: 5 })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'number six',
    })

    expect(result.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
    expect(callsMatching(/update public\.groups/i)).toHaveLength(0)
  })

  it('limit 3: the 5th still hides — the cap bites at 5 open, not 4', async () => {
    installQueryRouter({ openReportsByReporter: 4 })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'number five',
    })
    expect(result.photoHidden).toBe(true)
  })

  it('a Page with no photo stores the report and hides nothing', async () => {
    installQueryRouter({ photoUrl: null })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'the text is the problem',
    })
    expect(result.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
    expect(callsMatching(/update public\.groups/i)).toHaveLength(0)
  })

  it('an already-hidden Page is not re-hidden, and no second photo_hidden event is written', async () => {
    installQueryRouter({ photoHiddenAt: new Date('2026-09-13T00:00:00Z') })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'someone else already flagged this',
    })
    expect(result.photoHidden).toBe(false)
    expect(eventsOfKind('group.photo_hidden')).toHaveLength(0)
  })
})

describe('report.create — no visible state', () => {
  it('writes nothing but the report row, the hide, and the two events', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' })

    const writes = (query.mock.calls as QueryCall[])
      .map(([sql]) => sql)
      .filter((sql) => /^\s*(insert|update|delete)/i.test(sql))

    expect(writes).toHaveLength(2)
    expect(writes.some((s) => /insert into public\.reports/i.test(s))).toBe(true)
    expect(writes.some((s) => /update public\.groups/i.test(s))).toBe(true)
  })

  it('touches no counter, badge, flag, ordering column or notification table', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' })

    const all = (query.mock.calls as QueryCall[]).map(([sql]) => sql).join('\n')
    expect(all).not.toMatch(/notification/i)
    expect(all).not.toMatch(/report_count|flag_count|reported_count/i)
    expect(all).not.toMatch(/insert into public\.member_events/i)
  })

  it('the update only ever nulls-in a hide — it never writes photo_url', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' })
    const [hide] = callsMatching(/update public\.groups/i)
    // Hiding is a projection concern. The URL and the storage object both
    // survive, which is exactly what makes a restore possible.
    expect(hide![0]).not.toMatch(/set[\s\S]*photo_url/i)
  })

  it('never puts the report body or the reporter id into an event payload', async () => {
    installQueryRouter()
    const body = 'a very identifying sentence'
    await reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body })

    for (const call of appendEvent.mock.calls) {
      const payload = JSON.stringify((call[2] as EventRow).payload ?? {})
      expect(payload).not.toContain(body)
      expect(payload).not.toContain(REPORTER_ID)
    }
  })
})

describe('report.create — the body bound is applied to the trimmed text', () => {
  it('accepts a full-length body that arrives with trailing whitespace', async () => {
    installQueryRouter()
    await reportCreate(ctx(), {
      subjectKind: 'group',
      subjectId: GROUP_ID,
      body: 'x'.repeat(2000) + '\n  ',
    })
    const [insert] = callsMatching(/insert into public\.reports/i)
    expect((insert![1] as string[]).some((v) => v === 'x'.repeat(2000))).toBe(true)
  })

  it('refuses a body that is over the bound once trimmed', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(), {
        subjectKind: 'group',
        subjectId: GROUP_ID,
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/2000/)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })
})
