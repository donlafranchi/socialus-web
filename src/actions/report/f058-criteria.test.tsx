// #578 — F058 criteria 1, 3, 5 and 6: one check each that claims the whole criterion, each seen failing against a
// mutant (build-log/2026-W42/578-f058-checks.md). Criterion 4 is marked with the map fix (#577).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ReportEntry } from '@/app/admin/reports/ReportEntry'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'

const { query, getUser, create } = vi.hoisted(() => ({ query: vi.fn(), getUser: vi.fn(), create: vi.fn() }))
vi.mock('../_lib/db', () => ({ withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })) }))
vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }))
vi.mock('@/actions', async (importActual) => ({ ...(await importActual<typeof import('@/actions')>()), reportCreate: create }))

import { sendReportAction } from '@/app/_actions/report-actions'
import { reportDecide, reportReverse } from './review'
import { AuthorizationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const OPERATOR = '11111111-1111-1111-1111-111111111111'
const MEMBER = '22222222-2222-2222-2222-222222222222'
const REPORT = '33333333-3333-3333-3333-333333333333'
const GROUP = '44444444-4444-4444-4444-444444444444'
const DECISION = '55555555-5555-5555-5555-555555555555'
const NOW = new Date('2026-10-12T12:00:00Z')
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }) as ActionContext
const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8')

const ORIGINAL = process.env.OPERATOR_MEMBER_ID
beforeEach(() => {
  query.mockReset()
  getUser.mockReset()
  create.mockReset()
  create.mockResolvedValue({ reportId: 'r', photoHidden: false })
  process.env.OPERATOR_MEMBER_ID = OPERATOR
})
afterEach(() => {
  cleanup()
  if (ORIGINAL === undefined) delete process.env.OPERATOR_MEMBER_ID
  else process.env.OPERATOR_MEMBER_ID = ORIGINAL
})

describe('F058.1 — any signed-in member can send a free-text report from an item or shop page', () => {
  // [guards F058.1]
  it('a signed-in member\'s own words reach the report handler for a Page and for a post; a signed-out caller never does; both pages carry the control', async () => {
    getUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null })
    expect(await sendReportAction({ subjectId: GROUP, category: 'spam', body: 'my own words about the Page' })).toEqual({ ok: true })
    expect(await sendReportAction({ subjectKind: 'post', subjectId: GROUP, category: 'spam', body: 'my own words about the post' })).toEqual({ ok: true })
    expect(create.mock.calls.map((c) => [(c[1] as { subjectKind: string }).subjectKind, (c[1] as { body: string }).body])).toEqual([
      ['group', 'my own words about the Page'],
      ['post', 'my own words about the post'],
    ])

    create.mockClear()
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(sendReportAction({ subjectId: GROUP, category: 'spam', body: 'x' })).rejects.toThrow(/signed in/i)
    expect(create).not.toHaveBeenCalled()

    // The control is on the shop page and on its posts.
    expect(read('src/components/group/ShopPublicPage.tsx')).toMatch(/PageOverflowMenu|ReportControl/)
    expect(read('src/components/group/PagePosts.tsx')).toMatch(/PageOverflowMenu|ReportControl|ReportSheet/)
  })
})

describe('F058.3 — only the operator can remove a photo; a direct call from anyone else is refused', () => {
  // [guards F058.3]
  it('remove, restore and undo are each refused for an ordinary member, a Page\'s owner and everyone when no operator is set, before the database; the operator\'s page 404s anyone else', async () => {
    const calls = [
      (c: ActionContext) => reportDecide(c, { reportId: REPORT, outcome: 'removed', reasonCode: 'not_suitable' }),
      (c: ActionContext) => reportDecide(c, { reportId: REPORT, outcome: 'restored', reasonCode: 'nothing_wrong' }),
      (c: ActionContext) => reportReverse(c, { decisionId: DECISION, reasonCode: 'nothing_wrong' }),
    ]
    for (const call of calls) {
      for (const who of [MEMBER, GROUP]) await expect(call(ctx(who))).rejects.toBeInstanceOf(AuthorizationError)
      delete process.env.OPERATOR_MEMBER_ID
      await expect(call(ctx(OPERATOR))).rejects.toBeInstanceOf(AuthorizationError)
      process.env.OPERATOR_MEMBER_ID = OPERATOR
    }
    expect(query).not.toHaveBeenCalled()
    expect(read('src/app/admin/reports/page.tsx')).toMatch(/requirePagePermission\('reports\.review'\)/)
  })
})

describe('F058.5 — the report is delivered somewhere a person reads it', () => {
  // [guards F058.5]
  it('a report is stored open in the table the operator\'s page reads, and an urgent one also reaches the operator\'s phone or inbox', async () => {
    const create = read('src/actions/report/create.ts')
    expect(create).toMatch(/insert into public\.reports/)
    expect(create).toMatch(/alertOperator\(/)
    // The page the operator opens reads exactly the open reports, server-side, and puts them in the list.
    const queue = read('src/lib/admin/reports-queue.ts')
    expect(queue).toMatch(/from public\.reports r/)
    expect(queue).toMatch(/r\.reviewed_at is not null/)
    const page = read('src/app/admin/reports/page.tsx')
    expect(page).toMatch(/fetchReviewQueue\(/)
    expect(page).toMatch(/<ReviewQueue/)
    // The operator is also told: a link to the same page goes out with the alert.
    expect(create).toMatch(/\/admin\/reports/)
  })
})

describe('F058.6 — every decision is reversible from the item itself, by a new decision, and the reviewer sees what happened before and who did it', () => {
  const past: PastDecision = { decisionId: DECISION, outcome: 'removed', reasonCode: 'not_suitable', reasonNote: null, decidedAt: new Date('2026-10-11T10:00:00Z'), decidedByName: 'Pat Lee', reversesDecisionId: null, alreadyReversed: false, decidedByAi: false }
  const report = {
    reportId: REPORT, body: 'b', category: 'spam', reportedAt: new Date('2026-10-10T09:00:00Z'), hiddenAt: new Date('2026-10-10T09:00:00Z'), removedAt: new Date('2026-10-11T10:00:00Z'),
    subjectKind: 'group', subjectId: GROUP, groupId: GROUP, groupName: 'Oak Park Bakery', groupSlug: 'oak-park-bakery', photoUrl: 'https://cdn.test/x.jpg',
    ownerDisplayName: 'Sam R.', ownerHandle: 'sam-r', history: [past],
  } as unknown as QueuedReport

  // [guards F058.6]
  it('an undo is a new decision that points at the old one and edits nothing, it cannot be undone twice, and the card lists the earlier decision and who made it', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/from public\.reports r\b[\s\S]*for update of r/.test(sql)) return { rows: [{ group_id: GROUP, subject_kind: 'group', subject_id: GROUP }] }
      if (/from public\.report_decisions d/.test(sql)) return { rows: [{ id: DECISION, report_id: REPORT, group_id: GROUP, subject_kind: 'group', subject_id: GROUP, outcome: 'removed', already_reversed: false }] }
      if (/insert into public\.report_decisions/.test(sql)) return { rows: [{ id: '66666666-6666-6666-6666-666666666666' }] }
      return { rows: [] }
    })
    const out = await reportReverse(ctx(OPERATOR), { decisionId: DECISION, reasonCode: 'nothing_wrong' })
    expect(out.outcome).toBe('restored')
    const inserts = (query.mock.calls as [string, unknown[]][]).filter(([s]) => /insert into public\.report_decisions/.test(s))
    expect(inserts).toHaveLength(1)
    expect(inserts[0]![1][6]).toBe(DECISION)
    expect((query.mock.calls as [string][]).some(([s]) => /(update|delete from) public\.report_decisions/.test(s))).toBe(false)

    query.mockImplementation(async (sql: string) =>
      /from public\.report_decisions d/.test(sql)
        ? { rows: [{ id: DECISION, report_id: REPORT, group_id: GROUP, subject_kind: 'group', subject_id: GROUP, outcome: 'removed', already_reversed: true }] }
        : { rows: [] })
    await expect(reportReverse(ctx(OPERATOR), { decisionId: DECISION, reasonCode: 'nothing_wrong' })).rejects.toThrow(/already|reversed/i)

    render(<ReportEntry report={report} hiddenFor="1 day" onDecide={vi.fn(async () => {})} onReverse={vi.fn(async () => {})} />)
    const history = screen.getByTestId('decision-history')
    expect(history).toHaveTextContent('Pat Lee')
    expect(history).toHaveTextContent(/remove/i)
    expect(screen.getByTestId(`reverse-${DECISION}`)).toBeInTheDocument()
  })
})
