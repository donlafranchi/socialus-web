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
const { textOperator } = vi.hoisted(() => ({ textOperator: vi.fn(async () => ({ sent: true })) }))
vi.mock('@/lib/notify/operator-sms', () => ({ textOperator }))

import { reportCreate } from './create'
import { AuthorizationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const GROUP_ID = '11111111-1111-1111-1111-111111111111'
const REPORTER_ID = '22222222-2222-2222-2222-222222222222'
const FOUNDER_ID = '44444444-4444-4444-4444-444444444444'
const POST_ID = '55555555-5555-5555-5555-555555555555'
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
    builderOnReal?: boolean
    hideBar?: number
    postExists?: boolean
    postHiddenAt?: Date | null
    postLockedBody?: string | null
    /** When this reporter's earlier reports were dismissed (the operator approved the content). */
    dismissedAt?: Date[]
  } = {},
) {
  const {
    groupExists = true,
    photoUrl = PHOTO,
    photoHiddenAt = null,
    photoHideLockedUrl = null,
    priorReportsBySameMember = 0,
    openReportsByReporter = 0,
    builderOnReal = false,
    hideBar = 0,
    postExists = true,
    postHiddenAt = null,
    postLockedBody = null,
    dismissedAt = [],
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
                builder_on_real: builderOnReal,
                founder_member_id: FOUNDER_ID,
                name: 'Oak Park Bakery',
                hide_bar: hideBar,
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
    if (/from public\.page_posts/i.test(sql) && /select/i.test(sql)) {
      return {
        rows: postExists
          ? [
              {
                id: POST_ID,
                group_id: GROUP_ID,
                body: 'A post body.',
                discoverability: 'listed',
                hidden_at: postHiddenAt,
                hide_locked_body: postLockedBody,
                builder_on_real: builderOnReal,
                reporter_is_builder: false,
                founder_member_id: FOUNDER_ID,
                name: 'Oak Park Bakery',
                hide_bar: hideBar,
              },
            ]
          : [],
      }
    }
    if (/update public\.page_posts/i.test(sql)) return { rows: [{ id: POST_ID }] }
    if (/from public\.report_decisions/i.test(sql)) return { rows: dismissedAt.map((d) => ({ decided_at: d })) }
    if (/insert into public\.member_notices/i.test(sql)) return { rows: [] }
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
      category: 'other',
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
      category: 'other',
      subjectId: GROUP_ID,
      body: '   it is a stolen photo   ',
    })
    const [insert] = callsMatching(/insert into public\.reports/i)
    expect(insert![1]).toContain('it is a stolen photo')
  })

  it('rejects a body that is only whitespace', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: '     ' }),
    ).rejects.toThrow()
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })

  it('stores repeat reports as separate rows', async () => {
    installQueryRouter({ priorReportsBySameMember: 1, photoHiddenAt: new Date() })
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'again' })
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
  })

  it('rejects a report against a Page that does not exist', async () => {
    installQueryRouter({ groupExists: false })
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' }),
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
        category: 'other',
        subjectId: GROUP_ID,
        body: 'x',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })

  it('rejects an empty acting member — anonymous reporting is out of v1', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(''), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })
})

describe('report.create — the three limits', () => {
  it('limit 1: a second report by the same member on the same Page stores but does not re-hide', async () => {
    installQueryRouter({ priorReportsBySameMember: 1 })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      category: 'other',
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
      category: 'other',
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
      category: 'other',
      subjectId: GROUP_ID,
      body: 'the new one is worse',
    })
    expect(result.photoHidden).toBe(true)
  })

  it('limit 3: the 6th open report by one reporter stores and queues but does not hide', async () => {
    installQueryRouter({ openReportsByReporter: 5 })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      category: 'other',
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
      category: 'other',
      subjectId: GROUP_ID,
      body: 'number five',
    })
    expect(result.photoHidden).toBe(true)
  })

  it('a Page with no photo stores the report and hides nothing', async () => {
    installQueryRouter({ photoUrl: null })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      category: 'other',
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
      category: 'other',
      subjectId: GROUP_ID,
      body: 'someone else already flagged this',
    })
    expect(result.photoHidden).toBe(false)
    expect(eventsOfKind('group.photo_hidden')).toHaveLength(0)
  })
})

describe('report.create — no visible state', () => {
  it('writes nothing but the report row, the hide, and the poster\'s notice (F078 criterion 3 amends F058 acceptance 2), plus the two events', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' })

    const writes = (query.mock.calls as QueryCall[])
      .map(([sql]) => sql)
      .filter((sql) => /^\s*(insert|update|delete)/i.test(sql))

    expect(writes).toHaveLength(3)
    expect(writes.some((s) => /insert into public\.member_notices/i.test(s))).toBe(true)
    expect(writes.some((s) => /insert into public\.reports/i.test(s))).toBe(true)
    expect(writes.some((s) => /update public\.groups/i.test(s))).toBe(true)
  })

  it('touches no counter, badge, flag, ordering column or notification table', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' })

    const all = (query.mock.calls as QueryCall[]).map(([sql]) => sql).join('\n')
    expect(all).not.toMatch(/notification/i)
    expect(all).not.toMatch(/report_count|flag_count|reported_count/i)
    expect(all).not.toMatch(/insert into public\.member_events/i)
  })

  it('the update only ever nulls-in a hide — it never writes photo_url', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' })
    const [hide] = callsMatching(/update public\.groups/i)
    // Hiding is a projection concern. The URL and the storage object both
    // survive, which is exactly what makes a restore possible.
    expect(hide![0]).not.toMatch(/set[\s\S]*photo_url/i)
  })

  it('never puts the report body or the reporter id into an event payload', async () => {
    installQueryRouter()
    const body = 'a very identifying sentence'
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body })

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
      category: 'other',
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
        category: 'other',
        subjectId: GROUP_ID,
        body: 'x'.repeat(2001),
      }),
    ).rejects.toThrow(/2000/)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(0)
  })
})

describe('#280 — a builder report on a real Page', () => {
  it('stores and queues the report but never hides a real photo', async () => {
    installQueryRouter({ builderOnReal: true })
    const result = await reportCreate(ctx(), {
      subjectKind: 'group',
      category: 'other',
      subjectId: GROUP_ID,
      body: 'Testing the report flow.',
    })
    expect(result).toEqual({ reportId: REPORT_ID, photoHidden: false })
    expect(callsMatching(/update public\.groups/i)).toHaveLength(0)
  })

  it('asks the database whether the reporter is a builder and the Page is not', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'other', subjectId: GROUP_ID, body: 'x' })
    const [subject] = callsMatching(/from public\.groups/i)
    expect(subject![0]).toMatch(/is_builder\(\$2\)/)
    expect(subject![1]).toContain(REPORTER_ID)
  })
})

describe('F078/F080 — the reporter picks a reason', () => {
  beforeEach(() => textOperator.mockClear())

  // [guards F078.9]
  it('refuses a report with no reason chosen', async () => {
    installQueryRouter()
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', subjectId: GROUP_ID, body: 'x' }),
    ).rejects.toThrow()
    await expect(
      reportCreate(ctx(), { subjectKind: 'group', category: 'children', subjectId: GROUP_ID, body: 'x' }),
    ).rejects.toThrow()
  })

  it('stores the reason with the report', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'spam', subjectId: GROUP_ID, body: 'x' })
    const [insert] = callsMatching(/insert into public\.reports/i)
    expect(insert![0]).toMatch(/category/)
    expect(insert![1]).toContain('spam')
  })
})

describe('F080 — sensitive content hides at any bar and texts Don', () => {
  beforeEach(() => textOperator.mockClear())

  // [guards F080.4 partial: the hide and the text are triggered; delivery is Twilio's]
  it('hides even past the per-member and open-report limits', async () => {
    installQueryRouter({ priorReportsBySameMember: 1, openReportsByReporter: 6 })
    const res = await reportCreate(ctx(), { subjectKind: 'group', category: 'sensitive_content', subjectId: GROUP_ID, body: 'x' })
    expect(res.photoHidden).toBe(true)
  })

  it('threat of harm does the same', async () => {
    installQueryRouter({ priorReportsBySameMember: 1 })
    const res = await reportCreate(ctx(), { subjectKind: 'group', category: 'threat_of_harm', subjectId: GROUP_ID, body: 'x' })
    expect(res.photoHidden).toBe(true)
  })

  it('an ordinary reason still respects the limits', async () => {
    installQueryRouter({ priorReportsBySameMember: 1 })
    const res = await reportCreate(ctx(), { subjectKind: 'group', category: 'spam', subjectId: GROUP_ID, body: 'x' })
    expect(res.photoHidden).toBe(false)
  })

  it('texts Don for sensitive content and threat of harm, and only those', async () => {
    for (const category of ['sensitive_content', 'threat_of_harm'] as const) {
      installQueryRouter()
      await reportCreate(ctx(), { subjectKind: 'group', category, subjectId: GROUP_ID, body: 'x' })
    }
    expect(textOperator).toHaveBeenCalledTimes(2)
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'spam', subjectId: GROUP_ID, body: 'x' })
    expect(textOperator).toHaveBeenCalledTimes(2)
  })

  it('never texts Don about a builder\'s report on a real Page', async () => {
    installQueryRouter({ builderOnReal: true })
    await reportCreate(ctx(), { subjectKind: 'group', category: 'sensitive_content', subjectId: GROUP_ID, body: 'x' })
    expect(textOperator).not.toHaveBeenCalled()
  })

  it('the text names the category and the queue, never the reporter or what they wrote', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'sensitive_content', subjectId: GROUP_ID, body: 'secret words' })
    const [message] = textOperator.mock.calls[0] as unknown as [string]
    expect(message).toMatch(/sensitive content/i)
    expect(message).toMatch(/\/admin\/reports/)
    expect(message).not.toContain('secret words')
    expect(message).not.toContain(REPORTER_ID)
  })
})

// #220 (ruled 2026-10-07, option A) — the hide bar is per-metro data starting at
// 0, and the poster is told in-app what was hidden and the reporter's reason.
// Child-category reports stay operator-only until the NCMEC plan is settled.
describe('report.create — the metro hide bar (F078 criteria 6–8)', () => {
  const report = (category: 'other' | 'spam' | 'sensitive_content' | 'threat_of_harm') =>
    reportCreate(ctx(), { subjectKind: 'group', category, subjectId: GROUP_ID, body: 'Reported.' })

  // [guards F078.7 partial: the starting value; the config column itself is a migration]
  it('at the starting bar of 0 every report hides, as it always has', async () => {
    installQueryRouter({ hideBar: 0 })
    expect((await report('spam')).photoHidden).toBe(true)
  })

  // [guards F078.6 partial: no classifier yet, so no score reaches the bar]
  it('above 0 a report with no score is below the bar: stored and queued, nothing hides', async () => {
    installQueryRouter({ hideBar: 0.5 })
    const r = await report('spam')
    expect(r.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
    expect(callsMatching(/insert into public\.member_notices/i)).toHaveLength(0)
  })

  // [guards F078.8]
  it('sensitive content and threat of harm hide whatever the bar is', async () => {
    installQueryRouter({ hideBar: 0.99 })
    expect((await report('sensitive_content')).photoHidden).toBe(true)
    installQueryRouter({ hideBar: 0.99 })
    expect((await report('threat_of_harm')).photoHidden).toBe(true)
  })
})

describe('report.create — the poster is told (F078 criterion 3)', () => {
  const report = (category: 'other' | 'spam' | 'sensitive_content' | 'threat_of_harm') =>
    reportCreate(ctx(), { subjectKind: 'group', category, subjectId: GROUP_ID, body: 'Reported.' })

  it('a hide leaves the Page founder a notice with the category and the reporter\'s chosen reason', async () => {
    installQueryRouter()
    await report('spam')
    const [sql, params] = callsMatching(/insert into public\.member_notices/i)[0]!
    expect(sql).toMatch(/member_id/)
    expect(params).toEqual(expect.arrayContaining([FOUNDER_ID, REPORT_ID, 'spam']))
    expect(JSON.stringify(params)).toContain('Spam')
  })

  it('names the Page, so "Fix it" has somewhere to lead', async () => {
    installQueryRouter()
    await report('spam')
    const [sql, params] = callsMatching(/insert into public\.member_notices/i)[0]!
    expect(sql).toMatch(/page_id/)
    expect(params).toContain(GROUP_ID)
  })

  it('never carries what the reporter wrote or who they are', async () => {
    installQueryRouter()
    await reportCreate(ctx(), { subjectKind: 'group', category: 'spam', subjectId: GROUP_ID, body: 'secret words from reporter' })
    const [, params] = callsMatching(/insert into public\.member_notices/i)[0]!
    expect(JSON.stringify(params)).not.toContain('secret words')
    expect(params).not.toContain(REPORTER_ID)
  })

  it('nothing hidden, nothing said: a report that did not hide sends no notice', async () => {
    installQueryRouter({ photoHiddenAt: NOW })
    await report('spam')
    expect(callsMatching(/insert into public\.member_notices/i)).toHaveLength(0)
  })

  // [guards F102.14 partial: child-category content is never sent back to the poster]
  it('a sensitive-content report stays operator-only: the poster is not notified', async () => {
    installQueryRouter()
    const r = await report('sensitive_content')
    expect(r.photoHidden).toBe(true)
    expect(callsMatching(/insert into public\.member_notices/i)).toHaveLength(0)
  })

  it('a builder\'s report on a real Page hides nothing and tells nobody', async () => {
    installQueryRouter({ builderOnReal: true })
    await report('spam')
    expect(callsMatching(/insert into public\.member_notices/i)).toHaveLength(0)
  })
})

// F078 criterion 1 — a Post is reportable, and a report hides it.
describe('report.create — a Post', () => {
  const report = (category: 'other' | 'spam' | 'sensitive_content' = 'spam') =>
    reportCreate(ctx(), { subjectKind: 'post', category, subjectId: POST_ID, body: 'Reported.' })
  const hides = () => callsMatching(/update public\.page_posts/i)

  it('stores a post report and hides the post by making it private, remembering what it was', async () => {
    installQueryRouter()
    const r = await report()
    expect(r).toMatchObject({ reportId: REPORT_ID, photoHidden: true })
    expect(callsMatching(/insert into public\.reports/i)[0]![1]).toEqual(expect.arrayContaining(['post', POST_ID]))
    const [sql] = hides()[0]!
    expect(sql).toMatch(/discoverability = 'private'/)
    expect(sql).toMatch(/hidden_prior_discoverability = discoverability/)
    expect(sql).toMatch(/hidden_at is null/)
  })

  it('writes a group event for the post hide', async () => {
    installQueryRouter()
    await report()
    expect(eventsOfKind('group.post_hidden')).toHaveLength(1)
  })

  it('tells the Page founder, naming the reporter\'s reason', async () => {
    installQueryRouter()
    await report('spam')
    const [, params] = callsMatching(/insert into public\.member_notices/i)[0]!
    expect(params).toEqual(expect.arrayContaining([FOUNDER_ID, 'post', POST_ID, 'spam']))
  })

  it('a sensitive-content report hides it, texts the operator, and tells nobody else', async () => {
    installQueryRouter({ hideBar: 0.9 })
    const r = await report('sensitive_content')
    expect(r.photoHidden).toBe(true)
    expect(callsMatching(/insert into public\.member_notices/i)).toHaveLength(0)
    expect(textOperator).toHaveBeenCalledWith(expect.stringContaining('hid a Post'))
  })

  it('an already hidden post is not hidden twice', async () => {
    installQueryRouter({ postHiddenAt: NOW })
    expect((await report()).photoHidden).toBe(false)
    expect(hides()).toHaveLength(0)
  })

  it('a restore is sticky for the words reviewed', async () => {
    installQueryRouter({ postLockedBody: 'A post body.' })
    expect((await report()).photoHidden).toBe(false)
  })

  it('a post that does not exist is not found', async () => {
    installQueryRouter({ postExists: false })
    await expect(report()).rejects.toThrow(/not found/)
  })

  it('a builder\'s report on a real Page\'s post hides nothing', async () => {
    installQueryRouter({ builderOnReal: true })
    expect((await report()).photoHidden).toBe(false)
  })

  it('the hide bar applies as it does to a photo', async () => {
    installQueryRouter({ hideBar: 0.5 })
    expect((await report('spam')).photoHidden).toBe(false)
  })
})

// F102 criteria 6–7 and F078 criterion 10 — counters on the act of reporting.
describe('report.create — the reporter\'s record limits only the hide', () => {
  const day = 86_400_000
  const ago = (n: number) => new Date(NOW.getTime() - n * day)
  const report = (category: 'other' | 'spam' | 'sensitive_content' = 'spam') =>
    reportCreate(ctx(), { subjectKind: 'group', category, subjectId: GROUP_ID, body: 'Reported.' })

  // [guards F102.6]
  it('after one dismissed report in 30 days the cap drops from 5 open to 1', async () => {
    installQueryRouter({ dismissedAt: [ago(10)], openReportsByReporter: 1 })
    expect((await report()).photoHidden).toBe(false)
    installQueryRouter({ dismissedAt: [ago(10)], openReportsByReporter: 0 })
    expect((await report()).photoHidden).toBe(true)
  })

  it('a dismissal older than 30 days no longer counts', async () => {
    installQueryRouter({ dismissedAt: [ago(31)], openReportsByReporter: 4 })
    expect((await report()).photoHidden).toBe(true)
  })

  // [guards F102.7]
  it('two dismissed in 30 days start a 14-day cool-down: stored and queued, nothing hides', async () => {
    installQueryRouter({ dismissedAt: [ago(3), ago(20)], openReportsByReporter: 0 })
    const r = await report()
    expect(r.photoHidden).toBe(false)
    expect(callsMatching(/insert into public\.reports/i)).toHaveLength(1)
  })

  it('the cool-down ends 14 days after the second dismissal', async () => {
    installQueryRouter({ dismissedAt: [ago(15), ago(20)], openReportsByReporter: 0 })
    expect((await report()).photoHidden).toBe(true)
  })

  // [guards F078.10]
  it('three strikes: after three dismissed reports, ever, nothing the reporter files hides', async () => {
    installQueryRouter({ dismissedAt: [ago(200), ago(150), ago(100)], openReportsByReporter: 0 })
    expect((await report()).photoHidden).toBe(false)
  })

  it('sensitive content still hides from a reporter with a record, and still texts the operator', async () => {
    installQueryRouter({ dismissedAt: [ago(3), ago(20)] })
    expect((await report('sensitive_content')).photoHidden).toBe(true)
    expect(textOperator).toHaveBeenCalled()
  })
})
