import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// #628 — F078 criteria 3, 4, 5, 6 and 7 as ruled (courtesy notice first, #626; email until Twilio, #707), one check
// each that claims the whole criterion. The real operator alert runs here with only the network stubbed.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({ withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) }))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/moderation/after-report', () => ({ assessAfterReport: vi.fn() }))

import { reportCreate } from './create'
import { reportAnswer } from './answer'
import { lapsed, groupBySubject } from '@/lib/admin/review-subjects'
import type { ActionContext } from '../_lib/context'

const GROUP = '11111111-1111-1111-1111-111111111111'
const REPORTER = '22222222-2222-2222-2222-222222222222'
const FOUNDER = '44444444-4444-4444-4444-444444444444'
const REPORT = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-10-12T12:00:00Z')
const ctx = { actingMemberId: REPORTER, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW } as ActionContext

function install({ hideBar = 0, othersBefore = 0, openByReporter = 0 }: { hideBar?: number | string; othersBefore?: number; openByReporter?: number } = {}) {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.groups/i.test(sql) && /select/i.test(sql))
      return { rows: [{ id: GROUP, group_id: GROUP, photo_url: 'https://cdn.test/p.jpg', photo_hidden_at: null, photo_hide_locked_url: null, builder_on_real: false, reporter_is_builder: false, founder_member_id: FOUNDER, name: 'Oak Park Bakery', hide_bar: hideBar }] }
    if (/reporter_member_id <> \$1/i.test(sql)) return { rows: [{ count: String(othersBefore) }] }
    if (/reviewed_at is null/i.test(sql)) return { rows: [{ count: String(openByReporter) }] }
    if (/count/i.test(sql)) return { rows: [{ count: '0' }] }
    if (/insert into public\.reports/i.test(sql)) return { rows: [{ id: REPORT }] }
    if (/from public\.report_decisions/i.test(sql)) return { rows: [] }
    if (/update public\.groups/i.test(sql)) return { rows: [{ id: GROUP }] }
    if (/insert into public\.member_notices/i.test(sql)) return { rows: [] }
    if (/insert into public\.legal_holds/i.test(sql)) return { rows: [] }
    throw new Error(`unexpected query in test: ${sql}`)
  })
}
const calls = (re: RegExp) => (query.mock.calls as [string, unknown[]][]).filter(([sql]) => re.test(sql))
const report = (category: 'spam' | 'other' | 'threat_of_harm' | 'sensitive_content') =>
  reportCreate(ctx, { subjectKind: 'group', category, subjectId: GROUP, body: 'Reported.' })

const ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'OPERATOR_PHONE', 'RESEND_API_KEY', 'ADMIN_EMAILS'] as const
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {}
let sent: string[]
beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  sent = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    sent.push(String(url))
    return new Response('{}', { status: 200 })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('F078.3 — the poster is told, in-app, never by email', () => {
  // [guards F078.3]
  it('a hide leaves the owner a notice in the same transaction with the category, the reporter\'s chosen reason and a plain explanation, and sends no email or text to them; sensitive content is the ruled exception', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.ADMIN_EMAILS = 'ops@example.test'
    install({ othersBefore: 1 })
    expect((await report('spam')).photoHidden).toBe(true)
    const [, params] = calls(/insert into public\.member_notices/i)[0]!
    expect(params[0]).toBe(FOUNDER)
    expect(params).toEqual(expect.arrayContaining(['spam']))
    const message = params.find((p) => typeof p === 'string' && p.includes('Spam')) as string
    expect(message).toMatch(/hidden/i)
    expect(message).toMatch(/nothing's been deleted/i)
    expect(sent).toEqual([]) // an ordinary report alerts nobody, and nothing is mailed to the poster

    // Sensitive content (children) never goes back to the poster (ruled 2026-10-07); the operator is the only one told.
    install()
    await report('sensitive_content')
    expect(calls(/insert into public\.member_notices/i)).toHaveLength(0)
    expect(sent).toEqual(['https://api.resend.com/emails'])
  })
})

describe('F078.5 — urgent flags alert the operator at once; everything else only queues', () => {
  // [guards F078.5]
  it('threat of harm and sensitive content alert after the commit whatever the bar or the reporter\'s record; by text once Twilio is set, else by email; any other reason is stored and queued and alerts nobody', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.ADMIN_EMAILS = 'ops@example.test'
    for (const category of ['threat_of_harm', 'sensitive_content'] as const) {
      sent = []
      install({ hideBar: 0.99, openByReporter: 19 })
      await report(category)
      expect(sent, category).toEqual(['https://api.resend.com/emails'])
    }
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+18885550199', OPERATOR_PHONE: '+19165550198' })
    sent = []
    install({ hideBar: 0.99 })
    await report('threat_of_harm')
    expect(sent).toEqual(['https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json'])

    sent = []
    install({ othersBefore: 1 })
    await report('other')
    expect(sent).toEqual([])
    expect(calls(/insert into public\.reports/i)).toHaveLength(1) // queued for the review view
  })
})

describe('F078.6 — below the bar nothing happens automatically, and it still lands in the queue', () => {
  // [guards F078.6]
  it('above a metro\'s bar an ordinary report is stored for the queue and hides nothing, tells nobody and alerts nobody; at the launch bar of zero nothing is below it', async () => {
    install({ hideBar: 0.5, othersBefore: 1 })
    const below = await report('spam')
    expect(below.photoHidden).toBe(false)
    expect(calls(/insert into public\.reports/i)).toHaveLength(1)
    expect(calls(/update public\.groups/i)).toHaveLength(0)
    expect(calls(/insert into public\.member_notices/i)).toHaveLength(0)
    expect(sent).toEqual([])

    install({ hideBar: 0, othersBefore: 1 })
    expect((await report('spam')).photoHidden).toBe(true)
  })
})

describe('F078.7 — the hide bar is data on the metro, starting at zero, and zero when the metro cannot be resolved', () => {
  // [guards F078.7]
  it('the handler reads the bar from the metro\'s row each time, falls back to zero, and holds no number of its own', async () => {
    install({ othersBefore: 1 })
    await report('spam')
    const [sql] = calls(/from public\.groups/i)[0]!
    expect(sql).toMatch(/min\(mp\.hide_bar\)[\s\S]*join public\.metro_polygons mp/)
    expect(sql).toMatch(/coalesce\(\(select min\(mp\.hide_bar\)[\s\S]*\), 0\) as hide_bar/)

    // Changing the value changes the outcome with no code in between: the same handler, a different row.
    install({ hideBar: 0, othersBefore: 1 })
    expect((await report('spam')).photoHidden).toBe(true)
    install({ hideBar: '0.25', othersBefore: 1 })
    expect((await report('spam')).photoHidden).toBe(false)

    const src = readFileSync(resolve(__dirname, 'create.ts'), 'utf8')
    expect(src).not.toMatch(/hideBar\s*(?:[<>]=?|===?)\s*0?\.\d/)
    expect(src).not.toMatch(/HIDE_BAR\s*=/)
  })
})

describe('F078.4 — one explanation; an unanswered takedown stays hidden and closes itself', () => {
  const POSTER = FOUNDER
  const NOTICE = '55555555-5555-5555-5555-555555555555'
  const answerCtx = { ...ctx, actingMemberId: POSTER } as ActionContext
  function installAnswer(answered: boolean, createdAt: Date) {
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (/from public\.member_notices/i.test(sql)) return { rows: [{ id: NOTICE, member_id: POSTER, report_id: REPORT, created_at: createdAt, answered }] }
      if (/insert into public\.report_answers/i.test(sql)) return { rows: [{ id: 'a1' }] }
      throw new Error('unexpected: ' + sql)
    })
  }

  // [guards F078.4 partial: "the only thing that creates work" reads differently since #626, because a second report queues for staff; the one answer, the nothing-else-written and the 14-day close are covered]
  it('takes one answer and writes nothing else, then no second; after 14 days no answer is taken and the row closes itself, still hidden', async () => {
    installAnswer(false, new Date('2026-10-10T12:00:00Z'))
    await reportAnswer(answerCtx, { noticeId: NOTICE })
    const writes = (query.mock.calls as [string][]).filter(([q]) => /^\s*(insert|update|delete)/i.test(q))
    expect(writes).toHaveLength(1)
    expect(writes[0]![0]).toMatch(/report_answers/)

    installAnswer(true, new Date('2026-10-10T12:00:00Z'))
    await expect(reportAnswer(answerCtx, { noticeId: NOTICE })).rejects.toThrow(/already/)

    installAnswer(false, new Date('2026-09-27T12:00:00Z'))
    await expect(reportAnswer(answerCtx, { noticeId: NOTICE })).rejects.toThrow(/closed/)

    const hiddenAt = new Date('2026-09-27T12:00:00Z')
    const [row] = groupBySubject([{ reportId: 'r', subjectKind: 'group', subjectId: 's', category: 'spam', status: 'hidden', hiddenAt, answer: null, history: [], reportedAt: hiddenAt } as never])
    expect(row!.status).toBe('hidden')
    expect(lapsed(row!, NOW)).toBe(true)
  })
})
