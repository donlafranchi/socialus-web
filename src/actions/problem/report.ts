// #443 — problem.report
//
// A member's "Report a problem". The WHOLE report goes to `problem_reports`, a
// private table nobody can read through the API; the scrubbed public Issue is
// made later, from this row, by the pipeline (src/lib/problem-reports). Signed-in
// members only: an anonymous write path is a separate, rule-laden thing.
//
// Rate-limited in the database, not the browser: a handful per member per hour
// and a platform-wide ceiling, so a stuck button or a script cannot fill the
// table or the Issue tracker. The route is stored as a path only.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { isOperator } from '../_lib/operator'
import type { ActionContext } from '../_lib/context'

export const REPORTS_PER_MEMBER_PER_HOUR = 5
export const REPORTS_PER_HOUR = 60

export const problemReportInput = z.object({
  description: z.string().trim().min(1).max(2000),
  route: z.string().max(300),
  userAgent: z.string().max(400).optional(),
  buildSha: z.string().max(80).optional(),
})
export type ProblemReportInput = z.infer<typeof problemReportInput>

export const problemReport = defineHandler(
  'problem.report',
  problemReportInput,
  async (ctx: ActionContext, input: ProblemReportInput): Promise<{ reportId: string }> => {
    const memberId = ctx.actingMemberId
    if (!memberId || memberId === 'self-bootstrap') {
      throw new Error('problem.report: a signed-in member is required')
    }
    const now = ctx.now()
    return withTransaction(async (client) => {
      const recent = await client.query<{ mine: string; everyone: string }>(
        `select count(*) filter (where member_id = $1) as mine, count(*) as everyone
           from public.problem_reports
          where created_at > $2::timestamptz - interval '1 hour'`,
        [memberId, now],
      )
      const row = recent.rows[0]!
      if (Number(row.mine) >= REPORTS_PER_MEMBER_PER_HOUR || Number(row.everyone) >= REPORTS_PER_HOUR) {
        throw new ValidationError('problem.report: too many reports just now; try again in a while')
      }
      const res = await client.query<{ id: string }>(
        `insert into public.problem_reports (member_id, role, route, build_sha, user_agent, description, created_at)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [
          memberId,
          isOperator(memberId) ? 'operator' : 'member',
          input.route.split(/[?#]/)[0] || '/',
          input.buildSha ?? null,
          input.userAgent ?? null,
          input.description,
          now,
        ],
      )
      return { reportId: res.rows[0]!.id }
    })
  },
)
