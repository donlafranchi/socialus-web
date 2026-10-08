import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// T122 (#12) — report.decide and report.reverse.
//
// Two things carry the weight here. Authorization: this is the project's first
// operator-privileged write and a non-operator must be refused even when they
// own the Page. And append-only: reversing must INSERT, never UPDATE a past
// decision — the moment a reversal edits history, the audit trail is fiction.

type QueryCall = [string, unknown[]?]

interface EventRow {
  group_id: string
  event_kind: string
  payload?: Record<string, unknown>
}

const { query, appendEvent } = vi.hoisted(() => ({
  query: vi.fn(),
  appendEvent: vi.fn<(ctx: unknown, table: string, row: EventRow) => Promise<void>>(
    async () => undefined,
  ),
}))

vi.mock('../_lib/db', () => ({
  withTransaction: vi.fn(async (fn: (c: { query: typeof query }) => unknown) => fn({ query })),
}))
vi.mock('../_lib/event-log', () => ({ appendEvent }))

import { reportDecide, reportReverse } from './review'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import type { ActionContext } from '../_lib/context'

const OPERATOR = '11111111-1111-1111-1111-111111111111'
const OWNER = '22222222-2222-2222-2222-222222222222'
const REPORT_ID = '33333333-3333-3333-3333-333333333333'
const GROUP_ID = '44444444-4444-4444-4444-444444444444'
const POST_ID = '77777777-7777-7777-7777-777777777777'
const DECISION_ID = '55555555-5555-5555-5555-555555555555'
const NEW_DECISION = '66666666-6666-6666-6666-666666666666'
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

function install(opts: { reportFound?: boolean; priorFound?: boolean; priorOutcome?: 'restored' | 'removed'; alreadyReversed?: boolean; subjectKind?: string; subjectId?: string } = {}) {
  const {
    reportFound = true,
    priorFound = true,
    priorOutcome = 'removed',
    alreadyReversed = false,
    subjectKind = 'group',
    subjectId = GROUP_ID,
  } = opts
  query.mockImplementation(async (sql: string) => {
    if (/from public\.reports r\b[\s\S]*for update of r/.test(sql)) {
      return { rows: reportFound ? [{ group_id: GROUP_ID, subject_kind: subjectKind, subject_id: subjectId }] : [] }
    }
    if (/from public\.report_decisions d/.test(sql)) {
      return {
        rows: priorFound
          ? [
              {
                id: DECISION_ID,
                report_id: REPORT_ID,
                group_id: GROUP_ID,
                subject_kind: subjectKind,
                subject_id: subjectId,
                outcome: priorOutcome,
                already_reversed: alreadyReversed,
              },
            ]
          : [],
      }
    }
    if (/insert into public\.report_decisions/.test(sql)) {
      return { rows: [{ id: NEW_DECISION }] }
    }
    return { rows: [] }
  })
}

const sql = (re: RegExp): QueryCall[] => (query.mock.calls as QueryCall[]).filter(([s]) => re.test(s))

const ORIGINAL = process.env.OPERATOR_MEMBER_ID
beforeEach(() => {
  query.mockReset()
  appendEvent.mockClear()
  process.env.OPERATOR_MEMBER_ID = OPERATOR
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPERATOR_MEMBER_ID
  else process.env.OPERATOR_MEMBER_ID = ORIGINAL
})

describe('only the operator decides — absence of a button is not authorization', () => {
  it('refuses an ordinary member, before touching the database', async () => {
    install()
    await expect(
      reportDecide(ctx(OWNER), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'not_suitable' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(query).not.toHaveBeenCalled()
  })

  it("refuses the Page's own owner", async () => {
    install()
    await expect(
      reportDecide(ctx(OWNER), { reportId: REPORT_ID, outcome: 'restored', reasonCode: 'nothing_wrong' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses everyone when OPERATOR_MEMBER_ID is unset', async () => {
    delete process.env.OPERATOR_MEMBER_ID
    install()
    await expect(
      reportDecide(ctx(OPERATOR), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'not_suitable' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('refuses reversal to a non-operator too', async () => {
    install()
    await expect(
      reportReverse(ctx(OWNER), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' }),
    ).rejects.toBeInstanceOf(AuthorizationError)
  })

  it('never reveals whether the report exists', async () => {
    install({ reportFound: false })
    const err = await reportDecide(ctx(OWNER), {
      reportId: REPORT_ID,
      outcome: 'removed',
      reasonCode: 'not_suitable',
    }).catch((e) => e)
    expect(err.message).toBe('report.decide: not permitted')
  })
})

describe('removal preserves the photo — that is what makes it reversible', () => {
  it('sets photo_removed_at and never nulls photo_url', async () => {
    install()
    await reportDecide(ctx(), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'not_suitable' })
    const [text] = sql(/update public\.groups/)[0]!
    expect(text).toContain('photo_removed_at = $2')
    expect(text).not.toContain('photo_url = null')
  })

  it('restoring clears both timestamps and re-locks against the current photo', async () => {
    install()
    await reportDecide(ctx(), { reportId: REPORT_ID, outcome: 'restored', reasonCode: 'nothing_wrong' })
    const [text] = sql(/update public\.groups/)[0]!
    expect(text).toContain('photo_hidden_at = null')
    expect(text).toContain('photo_removed_at = null')
    expect(text).toContain('photo_hide_locked_url = photo_url')
  })
})

describe('a decision is an event, not a state overwrite', () => {
  it('records who decided, when, and why', async () => {
    install()
    await reportDecide(ctx(), {
      reportId: REPORT_ID,
      outcome: 'removed',
      reasonCode: 'someone_elses_photo',
    })
    const [, params] = sql(/insert into public\.report_decisions/)[0]!
    expect(params).toEqual([REPORT_ID, OPERATOR, NOW, 'removed', 'someone_elses_photo', null, null])
  })

  it('keeps the derived columns on reports in step with the latest decision', async () => {
    install()
    await reportDecide(ctx(), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'not_suitable' })
    expect(sql(/update public\.reports/).length).toBe(1)
  })

  it('requires a note for "something else" — an empty other is not a reason', async () => {
    install()
    await expect(
      reportDecide(ctx(), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'other' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('reversal inserts, never edits', () => {
  it('writes a NEW decision pointing at the one it undid', async () => {
    install({ priorOutcome: 'removed' })
    const out = await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' })
    expect(out.reversedDecisionId).toBe(DECISION_ID)
    const [, params] = sql(/insert into public\.report_decisions/)[0]!
    expect(params?.[6]).toBe(DECISION_ID)
  })

  // The moment a reversal edits history, the audit trail is fiction.
  it('never updates or deletes the decision it reverses', async () => {
    install()
    await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' })
    expect(sql(/update public\.report_decisions/)).toHaveLength(0)
    expect(sql(/delete from public\.report_decisions/)).toHaveLength(0)
  })

  it('flips the outcome — undoing a removal restores', async () => {
    install({ priorOutcome: 'removed' })
    const out = await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' })
    expect(out.outcome).toBe('restored')
  })

  it('and undoing a restore removes', async () => {
    install({ priorOutcome: 'restored' })
    const out = await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'not_suitable' })
    expect(out.outcome).toBe('removed')
  })

  it('refuses a second reversal of the same decision — that is how reviewers ping-pong', async () => {
    install({ alreadyReversed: true })
    await expect(
      reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('reports a missing decision as missing, to the operator only', async () => {
    install({ priorFound: false })
    await expect(
      reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('writes an audit event naming the reversal and what it undid', async () => {
    install()
    await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'nothing_wrong' })
    const ev = appendEvent.mock.calls.find(
      (c) => (c[2] as EventRow).event_kind === 'group.decision_reversed',
    )
    expect((ev![2] as EventRow).payload).toMatchObject({
      reverses_decision_id: DECISION_ID,
      reviewed_by: OPERATOR,
      now_outcome: 'restored',
    })
  })
})

// The report-bombing caps (2026-09-18). Requiring an account is what makes
// these possible: an account is persistent and rate-limitable, an anonymous
// reporter is neither. That is the point of the wall — continuity, not identity.
describe('report-bombing is refused, not merely un-hidden', () => {
  const src = readFileSync(resolve(__dirname, 'create.ts'), 'utf8')

  it('has both caps set well above ordinary use', () => {
    expect(src).toMatch(/MAX_OPEN_REPORTS_TOTAL = (\d+)/)
    expect(src).toMatch(/MAX_REPORTS_PER_SUBJECT = (\d+)/)
    const total = Number(src.match(/MAX_OPEN_REPORTS_TOTAL = (\d+)/)![1])
    // Above the auto-hide cap of 5, so ordinary reporting is untouched.
    expect(total).toBeGreaterThan(5)
  })

  it('refuses BEFORE writing the row — a report nobody will read is still queue', () => {
    const refuse = src.indexOf('MAX_OPEN_REPORTS_TOTAL)')
    const insert = src.indexOf('insert into public.reports')
    expect(refuse).toBeGreaterThan(-1)
    expect(refuse).toBeLessThan(insert)
  })
})

// F078 criterion 1 — the same two buttons decide a reported Post.
describe('deciding on a reported Post', () => {
  const decide = (outcome: 'restored' | 'removed') =>
    reportDecide(ctx(), { reportId: REPORT_ID, outcome, reasonCode: outcome === 'restored' ? 'nothing_wrong' : 'not_suitable' })

  it('approve puts the post back to the audience it had, and locks that wording against re-hiding', async () => {
    install({ subjectKind: 'post', subjectId: POST_ID })
    await decide('restored')
    const [q, params] = sql(/update public\.page_posts/)[0]!
    expect(q).toMatch(/discoverability = coalesce\(hidden_prior_discoverability/)
    expect(q).toMatch(/hide_locked_body = body/)
    expect(q).toMatch(/hidden_at = null/)
    expect(params).toEqual([POST_ID])
    expect(sql(/update public\.groups/)).toHaveLength(0)
  })

  it('remove keeps it down and stamps when', async () => {
    install({ subjectKind: 'post', subjectId: POST_ID })
    await decide('removed')
    const [q, params] = sql(/update public\.page_posts/)[0]!
    expect(q).toMatch(/removed_at = \$2/)
    expect(q).not.toMatch(/[^_]discoverability = coalesce/)
    expect(params).toEqual([POST_ID, NOW])
  })

  it('the event names the post, on its Page', async () => {
    install({ subjectKind: 'post', subjectId: POST_ID })
    await decide('removed')
    expect(appendEvent.mock.calls.some((c) => (c[2] as EventRow).event_kind === 'group.post_removed' && (c[2] as EventRow).group_id === GROUP_ID)).toBe(true)
  })

  it('reversing a removal restores the post; reversing a restore takes it down again', async () => {
    install({ subjectKind: 'post', subjectId: POST_ID, priorOutcome: 'removed' })
    await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'reported_by_mistake' })
    expect(sql(/update public\.page_posts/)[0]![0]).toMatch(/discoverability = coalesce\(hidden_prior_discoverability/)
    query.mockReset()
    install({ subjectKind: 'post', subjectId: POST_ID, priorOutcome: 'restored' })
    await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'not_suitable' })
    expect(sql(/update public\.page_posts/)[0]![0]).toMatch(/discoverability = 'private'/)
  })
})

// F099 criteria 7, 8, 12 — a decision applies to the image that was reported, and only it.
describe('F099 — a decision on one image', () => {
  // [guards F099.8]
  it.each([
    ['restored', /update public\.page_posts[\s\S]*photo_hidden_at = null[\s\S]*photo_hide_locked_url = photo_url/],
    ['removed', /update public\.page_posts[\s\S]*photo_removed_at = \$2/],
  ] as const)("%s on a post photo changes that post's photo and nothing on groups", async (outcome, re) => {
    install({ subjectKind: 'post_photo', subjectId: POST_ID })
    await reportDecide(ctx(), { reportId: REPORT_ID, outcome, reasonCode: 'not_suitable' })
    const [u] = sql(/update public\.page_posts/)
    expect(u![0]).toMatch(re)
    expect(u![1]).toContain(POST_ID)
    expect(sql(/update public\.groups/)).toHaveLength(0)
    expect((appendEvent.mock.calls[0]![2] as EventRow).group_id).toBe(GROUP_ID)
  })

  // [guards F099.8]
  it("a decision on a Page picture changes picture_*, never the Page's photo", async () => {
    install({ subjectKind: 'page_picture', subjectId: GROUP_ID })
    await reportDecide(ctx(), { reportId: REPORT_ID, outcome: 'removed', reasonCode: 'not_suitable' })
    const [u] = sql(/update public\.groups/)
    expect(u![0]).toMatch(/picture_removed_at/)
    expect(u![0]).not.toMatch(/\bphoto_(removed|hidden)_at/)
  })

  it('reversing a decision on a post photo undoes it on that photo', async () => {
    install({ subjectKind: 'post_photo', subjectId: POST_ID, priorOutcome: 'removed' })
    await reportReverse(ctx(), { decisionId: DECISION_ID, reasonCode: 'not_suitable' })
    const [u] = sql(/update public\.page_posts/)
    expect(u![0]).toMatch(/photo_hidden_at = null/)
    expect(sql(/update public\.groups/)).toHaveLength(0)
  })
})
