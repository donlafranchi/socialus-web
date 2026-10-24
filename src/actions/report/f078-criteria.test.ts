import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

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
import { ReportControl } from '@/components/group/ReportControl'

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

// #834 / #835 — F078 criteria 2, 4a, 10, 12 and F080 criterion 4, each claimed whole. One in-memory store stands in
// for the reports table, so "who filed what" is real state across calls, not a count handed to the handler.
type Kind = 'group' | 'post' | 'page_picture' | 'post_photo'
const POST = '66666666-6666-6666-6666-666666666666'
const ALICE = '77777777-7777-7777-7777-777777777777'
const BEN = '88888888-8888-8888-8888-888888888888'
function installStore({ hideBar = 0, dismissed = {} as Record<string, Date[]> } = {}) {
  const reports: { reporter: string; kind: string; subject: string }[] = []
  const hidden = new Set<string>()
  query.mockReset()
  query.mockImplementation(async (sql: string, p: unknown[] = []) => {
    const [a, b, c] = p as string[]
    if (/^\s*select/i.test(sql) && /from public\.groups/i.test(sql)) {
      const picture = /picture_url/.test(sql)
      return { rows: [{ group_id: GROUP, photo_url: 'https://cdn.test/p.jpg', photo_hidden_at: hidden.has(`${picture ? 'page_picture' : 'group'}:${a}`) ? NOW : null, photo_hide_locked_url: null, builder_on_real: false, reporter_is_builder: false, founder_member_id: FOUNDER, name: 'Oak Park Bakery', hide_bar: hideBar }] }
    }
    if (/^\s*select/i.test(sql) && /from public\.page_posts/i.test(sql)) {
      const photo = /pp\.photo_url/.test(sql)
      const h = hidden.has(`${photo ? 'post_photo' : 'post'}:${a}`) ? NOW : null
      return { rows: [{ group_id: GROUP, body: 'A post.', photo_url: 'https://cdn.test/q.jpg', photo_hidden_at: h, hidden_at: h, photo_hide_locked_url: null, hide_locked_body: null, builder_on_real: false, reporter_is_builder: false, founder_member_id: FOUNDER, name: 'Oak Park Bakery', hide_bar: hideBar }] }
    }
    if (/count/i.test(sql) && /reporter_member_id <> \$1/i.test(sql)) return { rows: [{ count: String(reports.filter((r) => r.reporter !== a && r.kind === b && r.subject === c).length) }] }
    if (/count/i.test(sql) && /subject_id = \$3/i.test(sql)) return { rows: [{ count: String(reports.filter((r) => r.reporter === a && r.kind === b && r.subject === c).length) }] }
    if (/count/i.test(sql) && /reviewed_at is null/i.test(sql)) return { rows: [{ count: String(reports.filter((r) => r.reporter === a).length) }] }
    if (/from public\.report_decisions/i.test(sql)) return { rows: (dismissed[a] ?? []).map((d) => ({ decided_at: d })) }
    if (/insert into public\.reports/i.test(sql)) {
      reports.push({ reporter: a, kind: b, subject: c })
      return { rows: [{ id: REPORT }] }
    }
    if (/insert into public\.(member_notices|legal_holds)/i.test(sql)) return { rows: [] }
    const upd = /update public\.(groups|page_posts) set (\w+)/i.exec(sql)
    if (upd) {
      const kind = upd[1] === 'groups' ? (upd[2] === 'picture_hidden_at' ? 'page_picture' : 'group') : upd[2] === 'photo_hidden_at' ? 'post_photo' : 'post'
      hidden.add(`${kind}:${a}`)
      return { rows: [{ id: a }] }
    }
    if (/update public\.page_posts/i.test(sql)) {
      hidden.add(`post:${a}`)
      return { rows: [{ id: a }] }
    }
    throw new Error(`unexpected query in test: ${sql}`)
  })
  return { reports, hidden }
}
const as = (member: string) => ({ ...ctx, actingMemberId: member }) as ActionContext
const subjectOf = (kind: Kind) => (kind === 'post' || kind === 'post_photo' ? POST : GROUP)
const file = (member: string, kind: Kind, category: 'spam' | 'harassment' | 'threat_of_harm' | 'sensitive_content' = 'spam') =>
  reportCreate(as(member), { subjectKind: kind, category, subjectId: subjectOf(kind), body: 'Reported.' })
const notices = () => calls(/insert into public\.member_notices/i).map(([sql]) => (/'courtesy'/.test(sql) ? 'courtesy' : 'content_hidden'))

describe('F078.2 — a first report is a courtesy notice; a second from someone else hides it and sends it to a person', () => {
  // [guards F078.2]
  it('on a Page photo and a post: the first ordinary report leaves it up and notifies the owner, a second member\'s report hides it, tells the owner and is queued for a person; threat of harm and sensitive content hide on the first report', async () => {
    for (const kind of ['group', 'post'] as const) {
      const store = installStore()
      expect((await file(ALICE, kind)).photoHidden, kind).toBe(false)
      expect(store.hidden.size, kind).toBe(0)
      expect(notices(), kind).toEqual(['courtesy'])
      expect(calls(/update public\.(groups|page_posts)/i), kind).toHaveLength(0)

      expect((await file(BEN, kind)).photoHidden, kind).toBe(true)
      expect(store.hidden.has(`${kind}:${subjectOf(kind)}`), kind).toBe(true)
      expect(notices(), kind).toEqual(['courtesy', 'content_hidden'])
      // The queue a person works from is the reports table: both are in it, undecided.
      expect(store.reports.map((r) => r.reporter), kind).toEqual([ALICE, BEN])
    }

    process.env.RESEND_API_KEY = 're_test'
    process.env.ADMIN_EMAILS = 'ops@example.test'
    for (const category of ['threat_of_harm', 'sensitive_content'] as const) {
      sent = []
      const store = installStore()
      expect((await file(ALICE, 'group', category)).photoHidden, category).toBe(true)
      expect(store.hidden.has(`group:${GROUP}`), category).toBe(true)
      expect(notices(), category).toEqual(category === 'threat_of_harm' ? ['content_hidden'] : [])
      expect(sent, category).toEqual(['https://api.resend.com/emails'])
    }
  })
})

describe('F078.12 — the report that hides must come from a different member', () => {
  // [guards F078.12]
  it('one member filing twice hides nothing and a third is refused; a second member\'s report then hides it', async () => {
    const store = installStore()
    expect((await file(ALICE, 'group')).photoHidden).toBe(false)
    expect((await file(ALICE, 'group')).photoHidden).toBe(false)
    await expect(file(ALICE, 'group')).rejects.toThrow(/already reported/)
    expect(store.hidden.size).toBe(0)
    expect(calls(/update public\.groups/i)).toHaveLength(0)

    expect((await file(BEN, 'group')).photoHidden).toBe(true)
    expect(store.hidden.has(`group:${GROUP}`)).toBe(true)
  })
})

describe('F078.4a — one explanation; an unanswered takedown stays hidden and closes itself', () => {
  const NOTICE = '55555555-5555-5555-5555-555555555555'
  const posterCtx = { ...ctx, actingMemberId: FOUNDER } as ActionContext
  function installNotice(answered: boolean, createdAt: Date) {
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (/from public\.member_notices/i.test(sql)) return { rows: [{ id: NOTICE, member_id: FOUNDER, report_id: REPORT, created_at: createdAt, answered }] }
      if (/insert into public\.report_answers/i.test(sql)) return { rows: [{ id: 'a1' }] }
      throw new Error('unexpected: ' + sql)
    })
  }
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
  const row = (hiddenAt: Date, answer: unknown = null) =>
    groupBySubject([{ reportId: 'r', subjectKind: 'group', subjectId: 's', category: 'spam', status: 'hidden', hiddenAt, answer, history: [], reportedAt: hiddenAt } as never])[0]!

  // [guards F078.4 partial: the one answer, the nothing-else-written and the 14-day close; "the only thing that creates work" reads differently since #626, because a second report queues for staff]
  it('takes one answer, which un-hides nothing, and refuses a second; for 14 days the takedown waits, then no answer is taken and it closes itself, still hidden; an answered one never closes on its own', async () => {
    installNotice(false, daysAgo(13))
    await reportAnswer(posterCtx, { noticeId: NOTICE })
    const writes = (query.mock.calls as [string][]).filter(([q]) => /^\s*(insert|update|delete)/i.test(q))
    expect(writes.map(([q]) => /report_answers/.test(q))).toEqual([true])

    installNotice(true, daysAgo(1))
    await expect(reportAnswer(posterCtx, { noticeId: NOTICE })).rejects.toThrow(/already/)

    installNotice(false, daysAgo(15))
    await expect(reportAnswer(posterCtx, { noticeId: NOTICE })).rejects.toThrow(/closed/)
    expect(calls(/insert into public\.report_answers/i)).toHaveLength(0)

    expect(lapsed(row(daysAgo(13)), NOW)).toBe(false)
    const closed = row(daysAgo(14))
    expect(lapsed(closed, NOW)).toBe(true)
    expect(closed.status).toBe('hidden')
    expect(lapsed(row(daysAgo(30), { kind: 'mistake' }), NOW)).toBe(false)
  })
})

describe('F078.10 — the reporter is told before sending; three rejected reports and theirs stop hiding', () => {
  const day = 86_400_000
  const ago = (n: number) => new Date(NOW.getTime() - n * day)
  function sheetSendingAs(member: string) {
    const onSend = async (i: { subjectId: string; category: 'spam'; body: string }) => {
      await reportCreate(as(member), { subjectKind: 'group', ...i })
      return { ok: true as const }
    }
    render(createElement(ReportControl, { subjectId: GROUP, subjectLabel: 'Oak Park Bakery', loggedIn: true, onSend: onSend as never }))
    fireEvent.click(screen.getByRole('button', { name: /more options/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /report this/i }))
  }

  // [guards F078.10]
  it('the sheet says not to misuse reports, with no numbers, for every reason before Send; a reporter with three rejected reports files one that is stored and queued but hides nothing, where two would still hide', async () => {
    for (const [dismissedTimes, hides] of [[[ago(200), ago(150), ago(100)], false], [[ago(200), ago(150)], true]] as const) {
      const store = installStore({ dismissed: { [ALICE]: [...dismissedTimes] } })
      await file(BEN, 'group')
      sheetSendingAs(ALICE)
      for (const reason of screen.getAllByRole('radio')) {
        fireEvent.click(reason)
        const line = screen.getByTestId('report-misuse')
        expect(line).toHaveTextContent(/please don't misuse reports/i)
        expect(line.textContent).not.toMatch(/\d|three|strike/i)
      }
      fireEvent.click(screen.getByRole('radio', { name: 'Spam' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Not a real bakery.' } })
      fireEvent.click(screen.getByRole('button', { name: /send/i }))
      await waitFor(() => expect(store.reports).toHaveLength(2))
      expect(store.hidden.has(`group:${GROUP}`), `${dismissedTimes.length} strikes`).toBe(hides)
      cleanup()
    }
  })
})

describe('F080.4 — a photo reported as sensitive is hidden at any bar and the operator is alerted', () => {
  // [guards F080.4]
  it('a Page picture and a post photo reported as sensitive content hide on the first report whatever the bar or the reporter\'s record, and alert the operator: by email until Twilio is set, by text once it is', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.ADMIN_EMAILS = 'ops@example.test'
    const struckOut = { [ALICE]: [new Date('2026-06-01'), new Date('2026-07-01'), new Date('2026-08-01')] }
    for (const kind of ['page_picture', 'post_photo'] as const) {
      sent = []
      const store = installStore({ hideBar: 0.99, dismissed: struckOut })
      expect((await file(ALICE, kind, 'sensitive_content')).photoHidden, kind).toBe(true)
      expect(store.hidden.has(`${kind}:${subjectOf(kind)}`), kind).toBe(true)
      expect(sent, kind).toEqual(['https://api.resend.com/emails'])
    }
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+18885550199', OPERATOR_PHONE: '+19165550198' })
    for (const kind of ['page_picture', 'post_photo'] as const) {
      sent = []
      const store = installStore({ hideBar: 0.99 })
      expect((await file(ALICE, kind, 'sensitive_content')).photoHidden, kind).toBe(true)
      expect(store.hidden.has(`${kind}:${subjectOf(kind)}`), kind).toBe(true)
      expect(sent, kind).toEqual(['https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json'])
    }
  })
})
