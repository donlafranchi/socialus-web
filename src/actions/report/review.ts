// T122 (#12) — report.restore and report.remove. The operator's two outcomes.
//
// Scenario: planning/scenario-F058.md. Don's 2026-09-13 decision put a hide in
// front of the takedown, so the operator's job is REVIEW: the photo is already
// hidden when they arrive, and they decide whether it stays hidden.
//
// AUTHORIZATION IS HERE, not in the UI. A non-operator calling either handler —
// including the Page's own owner — gets an AuthorizationError. Absence of a
// button is not authorization. This is the project's first operator-privileged
// write and it sets the pattern for every later one (#12).
//
// THE TWO OUTCOMES ARE NOT SYMMETRIC:
//
//   restore — reversible. Clears photo_hidden_at and takes out the sticky lock
//             (photo_hide_locked_url = photo_url), which is what stops the
//             restore → re-report → hidden-again loop. Replacing the photo
//             clears the lock on its own, so it cannot outlive what it covers.
//
//   remove  — permanent, and the only destructive act in the system. Nulls
//             photo_url so every read path loses it at once. The storage object
//             is deleted by the caller AFTER this commits, deliberately: a
//             storage failure must not roll back a takedown. A removed photo
//             still reachable at its old URL for a few minutes is a smaller
//             harm than a takedown that silently did not happen.
//
// BOTH WRITE AN EVENT ROW naming the acting member. That is the audit trail —
// who reviewed what, when, and what they did — and it is what makes operator
// access accountable rather than merely permitted. It matters more the moment
// the operator is not only Don.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { isOperator } from '../_lib/operator'
import type { ActionContext } from '../_lib/context'

export const reportReviewInput = z.object({ reportId: z.string().uuid() })
export type ReportReviewInput = z.infer<typeof reportReviewInput>

export interface ReportReviewResult {
  reportId: string
  groupId: string
  outcome: 'restored' | 'removed'
  /** Set on removal so the caller can delete the object after the commit. */
  removedPhotoUrl: string | null
}

interface SubjectRow {
  group_id: string
  photo_url: string | null
  photo_hidden_at: Date | null
  reviewed_at: Date | null
}

function requireOperator(ctx: ActionContext, verb: string): string {
  const memberId = ctx.actingMemberId
  if (!isOperator(memberId)) {
    // Same message either way. Telling an unauthorised caller whether the
    // report exists is a read they are not entitled to.
    throw new AuthorizationError(`${verb}: not permitted`)
  }
  return memberId as string
}

/** The report and its subject, locked for the length of the transaction. */
async function loadForReview(
  client: { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[] }> },
  reportId: string,
  verb: string,
): Promise<SubjectRow> {
  const res = await client.query<SubjectRow>(
    `select r.subject_id as group_id, g.photo_url, g.photo_hidden_at, r.reviewed_at
       from public.reports r
       join public.groups g on g.id = r.subject_id
      where r.id = $1
        and r.subject_kind = 'group'
      for update of r`,
    [reportId],
  )
  const row = res.rows[0]
  if (!row) throw new NotFoundError(`${verb}: report ${reportId} not found`)
  // A second review would overwrite the first reviewer's decision and its
  // timestamp, and the audit trail would show only the last one.
  if (row.reviewed_at !== null) {
    throw new ValidationError(`${verb}: report ${reportId} has already been reviewed`)
  }
  return row
}

export const reportRestore = defineHandler(
  'report.restore',
  reportReviewInput,
  async (ctx: ActionContext, input: ReportReviewInput): Promise<ReportReviewResult> => {
    const operator = requireOperator(ctx, 'report.restore')

    return withTransaction(async (client) => {
      const subject = await loadForReview(client, input.reportId, 'report.restore')
      const now = ctx.now()

      await client.query(
        `update public.reports
            set reviewed_at = $2, reviewed_by_member_id = $3, outcome = 'restored'
          where id = $1`,
        [input.reportId, now, operator],
      )

      // The lock is granted against the URL that was restored, so replacing the
      // photo drops it automatically.
      await client.query(
        `update public.groups
            set photo_hidden_at = null, photo_hide_locked_url = photo_url
          where id = $1`,
        [subject.group_id],
      )

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: subject.group_id,
        event_kind: 'group.photo_restored',
        payload: { report_id: input.reportId, reviewed_by: operator },
      })

      return {
        reportId: input.reportId,
        groupId: subject.group_id,
        outcome: 'restored',
        removedPhotoUrl: null,
      }
    })
  },
)

export const reportRemove = defineHandler(
  'report.remove',
  reportReviewInput,
  async (ctx: ActionContext, input: ReportReviewInput): Promise<ReportReviewResult> => {
    const operator = requireOperator(ctx, 'report.remove')

    return withTransaction(async (client) => {
      const subject = await loadForReview(client, input.reportId, 'report.remove')
      const now = ctx.now()

      await client.query(
        `update public.reports
            set reviewed_at = $2, reviewed_by_member_id = $3,
                outcome = 'removed', removed_at = $2
          where id = $1`,
        [input.reportId, now, operator],
      )

      // Nulling photo_url is what every read path sees. photo_hidden_at is
      // cleared too: with no photo there is nothing hidden, and leaving it set
      // would leave the Page looking like it were waiting on a review.
      await client.query(
        `update public.groups
            set photo_url = null, photo_hidden_at = null, photo_hide_locked_url = null
          where id = $1`,
        [subject.group_id],
      )

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: subject.group_id,
        event_kind: 'group.photo_removed',
        payload: { report_id: input.reportId, reviewed_by: operator },
      })

      return {
        reportId: input.reportId,
        groupId: subject.group_id,
        outcome: 'removed',
        removedPhotoUrl: subject.photo_url,
      }
    })
  },
)
