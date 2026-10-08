import { describe, it, expect, vi, beforeEach } from 'vitest'

// F102 criteria 3–4 — the poster says the report is wrong: one answer per hide,
// from the person it was about, within 14 days, and it changes nothing about
// what is hidden. Only a person decides that.

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))

vi.mock('../_lib/event-log', () => ({ appendEvent: vi.fn(async () => undefined) }))

import { reportAnswer } from './answer'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const POSTER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const NOTICE = '33333333-3333-3333-3333-333333333333'
const REPORT = '44444444-4444-4444-4444-444444444444'
const NOW = new Date('2026-10-10T12:00:00Z')
const ctx = (id: string = POSTER): ActionContext =>
  ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }) as ActionContext

function install(opts: { found?: boolean; owner?: string; answered?: boolean; createdAt?: Date } = {}) {
  const { found = true, owner = POSTER, answered = false, createdAt = new Date('2026-10-07T12:00:00Z') } = opts
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/from public\.member_notices/i.test(sql)) {
      return { rows: found ? [{ id: NOTICE, member_id: owner, report_id: REPORT, created_at: createdAt, answered }] : [] }
    }
    if (/insert into public\.report_answers/i.test(sql)) return { rows: [{ id: 'a1' }] }
    throw new Error('unexpected: ' + sql)
  })
}

const input = { noticeId: NOTICE, reason: 'mistaken' as const, note: 'It is my own shop sign.' }
const writes = () => (query.mock.calls as [string, unknown[]][]).filter(([q]) => /^\s*(insert|update|delete)/i.test(q))

beforeEach(() => {
  query.mockReset()
})

describe('report.answer — say the report is wrong', () => {
  it('records the poster\'s one answer with the reason and note', async () => {
    install()
    await reportAnswer(ctx(), input)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]![1]).toEqual(expect.arrayContaining([NOTICE, POSTER, 'mistaken', 'It is my own shop sign.']))
  })

  it('says which report the answer is to, so the AI can read it with the reply', async () => {
    install()
    expect(await reportAnswer(ctx(), input)).toEqual({ answerId: 'a1', reportId: REPORT })
  })

  it('changes nothing about what is hidden: the only write is the answer', async () => {
    install()
    await reportAnswer(ctx(), input)
    expect(writes().every(([q]) => /report_answers/i.test(q))).toBe(true)
  })

  it('offers exactly the three reasons, and a note of at most 280 characters', async () => {
    install()
    await expect(reportAnswer(ctx(), { ...input, reason: 'because' as never })).rejects.toThrow()
    await expect(reportAnswer(ctx(), { ...input, note: 'x'.repeat(281) })).rejects.toThrow()
    await expect(reportAnswer(ctx(), { ...input, reason: 'malicious' })).resolves.toBeDefined()
    await expect(reportAnswer(ctx(), { ...input, reason: 'misusing_reports' })).resolves.toBeDefined()
  })

  it('only the person the notice went to may answer it', async () => {
    install({ owner: OTHER })
    await expect(reportAnswer(ctx(), input)).rejects.toBeInstanceOf(AuthorizationError)
    expect(writes()).toHaveLength(0)
  })

  // [guards F102.3 partial: one answer per hide]
  it('one answer per hide', async () => {
    install({ answered: true })
    await expect(reportAnswer(ctx(), input)).rejects.toBeInstanceOf(ValidationError)
    expect(writes()).toHaveLength(0)
  })

  // [guards F102.4 partial: an unanswered hide closes itself after 14 days]
  it('after 14 days the hide has closed itself and no answer is taken', async () => {
    install({ createdAt: new Date('2026-09-25T12:00:00Z') })
    await expect(reportAnswer(ctx(), input)).rejects.toBeInstanceOf(ValidationError)
  })

  it('a notice that does not exist is not found', async () => {
    install({ found: false })
    await expect(reportAnswer(ctx(), input)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('needs a signed-in member', async () => {
    install()
    await expect(reportAnswer({ ...ctx(), actingMemberId: null as never }, input)).rejects.toBeInstanceOf(AuthorizationError)
  })
})
