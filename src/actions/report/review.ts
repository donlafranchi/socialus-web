// T122 (#12) — the operator's decisions. Two outcomes, and every one reversible.
//
// Scenario: planning/scenario-F058.md (amended 2026-09-17).
//
// A DECISION IS AN EVENT, NOT A STATE OVERWRITE. `report_decisions` is
// append-only and is the source of truth; the current status of a report is its
// latest row. Reversing inserts a new row pointing at what it undid — nothing
// is ever mutated or deleted to take something back.
//
// `reports.reviewed_at` / `reviewed_by_member_id` / `outcome` are kept as a
// PROJECTION of that latest row, written in the same transaction. Two sources
// of truth is a real cost and it is taken deliberately: three things already
// read those columns — the queue's `where reviewed_at is null`, the
// `reports_review_is_complete` constraint, and report.create's open-report cap.
// **The decisions table is authoritative; those columns follow it.**
//
// AUTHORIZATION IS HERE, not in the UI. A non-operator calling any of these —
// including the Page's own owner — gets an AuthorizationError. Absence of a
// button is not authorization.
//
// NO CONFIRM, NO UNDO WINDOW, on purpose. Removal preserves the URL and the
// bytes, so any decision can be undone from the item itself at any time. A
// confirm dialog that fires on every removal is one people learn to dismiss
// without reading, and a timed undo window adds a clock to reason about while
// being strictly weaker than permanent reversibility. The protection is that
// reversal is always available and the history is visible on the item — so a
// reviewer sees what happened before rather than reversing blind.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { isOperator } from '../_lib/operator'
import { REASON_CODES, reasonNeedsNote, type ReasonCode } from '@/lib/admin/reason-codes'
import type { ActionContext } from '../_lib/context'

const OUTCOMES = ['restored', 'removed'] as const
export type Outcome = (typeof OUTCOMES)[number]

export const reportDecideInput = z.object({
  reportId: z.string().uuid(),
  outcome: z.enum(OUTCOMES),
  reasonCode: z.enum(REASON_CODES),
  reasonNote: z.string().trim().min(1).max(1000).optional(),
})
export type ReportDecideInput = z.infer<typeof reportDecideInput>

export const reportReverseInput = z.object({
  decisionId: z.string().uuid(),
  reasonCode: z.enum(REASON_CODES),
  reasonNote: z.string().trim().min(1).max(1000).optional(),
})
export type ReportReverseInput = z.infer<typeof reportReverseInput>

export interface ReportDecisionResult {
  decisionId: string
  reportId: string
  groupId: string
  outcome: Outcome
  /** Set when this decision undid an earlier one. */
  reversedDecisionId: string | null
}

type Client = { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }> }

function requireOperator(ctx: ActionContext, verb: string): string {
  if (!isOperator(ctx.actingMemberId)) {
    // Identical either way. Telling an unauthorised caller whether the report
    // exists is a read they are not entitled to.
    throw new AuthorizationError(`${verb}: not permitted`)
  }
  return ctx.actingMemberId as string
}

function requireNote(input: { reasonCode: ReasonCode; reasonNote?: string }, verb: string): void {
  if (reasonNeedsNote(input.reasonCode) && !input.reasonNote) {
    throw new ValidationError(`${verb}: "${input.reasonCode}" needs a note saying what happened`)
  }
}

/**
 * Apply an outcome to the Page. Both directions are projection changes — the
 * URL and the bytes are never touched, which is what makes this reversible.
 */
async function project(client: Client, groupId: string, outcome: Outcome, now: Date) {
  if (outcome === 'restored') {
    // The lock is granted against the URL restored, so replacing the photo
    // drops it on its own and cannot outlive what it covers.
    await client.query(
      `update public.groups
          set photo_hidden_at = null,
              photo_removed_at = null,
              photo_hide_locked_url = photo_url
        where id = $1`,
      [groupId],
    )
    return
  }
  await client.query(
    `update public.groups
        set photo_removed_at = $2,
            photo_hidden_at = null
      where id = $1`,
    [groupId, now],
  )
}

async function insertDecision(
  client: Client,
  row: {
    reportId: string
    operator: string
    now: Date
    outcome: Outcome
    reasonCode: string
    reasonNote?: string
    reverses?: string | null
  },
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `insert into public.report_decisions
       (report_id, decided_by_member_id, decided_at, outcome,
        reason_code, reason_note, reverses_decision_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      row.reportId,
      row.operator,
      row.now,
      row.outcome,
      row.reasonCode,
      row.reasonNote ?? null,
      row.reverses ?? null,
    ],
  )
  return res.rows[0]!.id
}

/** Keep the derived columns on `reports` in step with the latest decision. */
async function projectReportRow(
  client: Client,
  reportId: string,
  outcome: Outcome,
  operator: string,
  now: Date,
) {
  await client.query(
    `update public.reports
        set reviewed_at = $2,
            reviewed_by_member_id = $3,
            outcome = $4,
            removed_at = case when $4 = 'removed' then $2 else null end
      where id = $1`,
    [reportId, now, operator, outcome],
  )
}

export const reportDecide = defineHandler(
  'report.decide',
  reportDecideInput,
  async (ctx: ActionContext, input: ReportDecideInput): Promise<ReportDecisionResult> => {
    const operator = requireOperator(ctx, 'report.decide')
    requireNote(input, 'report.decide')

    return withTransaction(async (client) => {
      const res = await client.query<{ group_id: string }>(
        `select r.subject_id as group_id
           from public.reports r
           join public.groups g on g.id = r.subject_id
          where r.id = $1 and r.subject_kind = 'group'
          for update of r`,
        [input.reportId],
      )
      const row = res.rows[0]
      if (!row) throw new NotFoundError(`report.decide: report ${input.reportId} not found`)

      const now = ctx.now()
      const decisionId = await insertDecision(client, {
        reportId: input.reportId,
        operator,
        now,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
      })
      await project(client, row.group_id, input.outcome, now)
      await projectReportRow(client, input.reportId, input.outcome, operator, now)

      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: row.group_id,
        event_kind: input.outcome === 'restored' ? 'group.photo_restored' : 'group.photo_removed',
        payload: {
          report_id: input.reportId,
          decision_id: decisionId,
          reviewed_by: operator,
          reason_code: input.reasonCode,
        },
      })

      return {
        decisionId,
        reportId: input.reportId,
        groupId: row.group_id,
        outcome: input.outcome,
        reversedDecisionId: null,
      }
    })
  },
)

export const reportReverse = defineHandler(
  'report.reverse',
  reportReverseInput,
  async (ctx: ActionContext, input: ReportReverseInput): Promise<ReportDecisionResult> => {
    const operator = requireOperator(ctx, 'report.reverse')
    requireNote(input, 'report.reverse')

    return withTransaction(async (client) => {
      const res = await client.query<{
        id: string
        report_id: string
        group_id: string
        outcome: Outcome
        already_reversed: boolean
      }>(
        `select d.id,
                d.report_id,
                r.subject_id as group_id,
                d.outcome,
                exists (
                  select 1 from public.report_decisions x
                   where x.reverses_decision_id = d.id
                ) as already_reversed
           from public.report_decisions d
           join public.reports r on r.id = d.report_id
          where d.id = $1
          for update of d`,
        [input.decisionId],
      )
      const prior = res.rows[0]
      if (!prior) {
        throw new NotFoundError(`report.reverse: decision ${input.decisionId} not found`)
      }
      // A double-undo has no defined meaning and is how two reviewers ping-pong.
      if (prior.already_reversed) {
        throw new ValidationError(
          `report.reverse: decision ${input.decisionId} has already been reversed`,
        )
      }

      const now = ctx.now()
      const outcome: Outcome = prior.outcome === 'removed' ? 'restored' : 'removed'

      const decisionId = await insertDecision(client, {
        reportId: prior.report_id,
        operator,
        now,
        outcome,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        reverses: prior.id,
      })
      await project(client, prior.group_id, outcome, now)
      await projectReportRow(client, prior.report_id, outcome, operator, now)

      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: prior.group_id,
        event_kind: 'group.decision_reversed',
        payload: {
          report_id: prior.report_id,
          decision_id: decisionId,
          reverses_decision_id: prior.id,
          reviewed_by: operator,
          reason_code: input.reasonCode,
          now_outcome: outcome,
        },
      })

      return {
        decisionId,
        reportId: prior.report_id,
        groupId: prior.group_id,
        outcome,
        reversedDecisionId: prior.id,
      }
    })
  },
)
