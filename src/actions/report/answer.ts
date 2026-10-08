// F102 criteria 3–4 — the poster says the report is wrong. One answer per hide,
// taken from the person the notice went to, for 14 days; after that an unanswered
// hide has closed itself. Writing the answer changes nothing about what is
// hidden: the content stays down until a person decides (F101).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const ANSWER_WINDOW_DAYS = 14

export const reportAnswerInput = z.object({
  noticeId: z.string().uuid(),
  reason: z.enum(['mistaken', 'malicious', 'misusing_reports']),
  note: z.string().trim().min(1).max(280),
})
export type ReportAnswerInput = z.infer<typeof reportAnswerInput>

export const reportAnswer = defineHandler(
  'report.answer',
  reportAnswerInput,
  async (ctx: ActionContext, input: ReportAnswerInput): Promise<{ answerId: string; reportId: string | null }> => {
    if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
      throw new AuthorizationError('report.answer: a signed-in member is required')
    }
    const memberId = ctx.actingMemberId

    return withTransaction(async (client) => {
      const res = await client.query<{ id: string; member_id: string; report_id: string | null; created_at: Date; answered: boolean }>(
        `select n.id, n.member_id, n.report_id, n.created_at,
                exists (select 1 from public.report_answers a where a.notice_id = n.id) as answered
           from public.member_notices n
          where n.id = $1 and n.kind = 'content_hidden'
          for update of n`,
        [input.noticeId],
      )
      const notice = res.rows[0]
      if (!notice) throw new NotFoundError(`report.answer: notice ${input.noticeId} not found`)
      if (notice.member_id !== memberId) throw new AuthorizationError('report.answer: not yours to answer')
      if (notice.answered) throw new ValidationError('report.answer: this one has been answered already')
      if (ctx.now().getTime() - new Date(notice.created_at).getTime() > ANSWER_WINDOW_DAYS * 86_400_000) {
        throw new ValidationError('report.answer: this one has closed')
      }

      const ins = await client.query<{ id: string }>(
        `insert into public.report_answers (notice_id, member_id, kind, wrong_reason, note, created_at)
         values ($1, $2, 'wrong', $3, $4, $5)
         returning id`,
        [input.noticeId, memberId, input.reason, input.note, ctx.now()],
      )
      return { answerId: ins.rows[0]!.id, reportId: notice.report_id }
    })
  },
)
