// #648 part 2 — the operator records the report number NCMEC gave back (beta: the manual CyberTipline web form).
// A field on the legal hold, never on anything a member can read. Recording it restarts the one-year keep from the
// day it was reported (18 U.S.C. 2258A: preserve for a year after the report).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { requirePermission } from '../_lib/staff'
import type { ActionContext } from '../_lib/context'

export const reportNcmecRecordInput = z.object({
  reportId: z.string().uuid(),
  reportNumber: z.string().trim().min(1).max(60),
})
export type ReportNcmecRecordInput = z.infer<typeof reportNcmecRecordInput>

export const reportNcmecRecord = defineHandler(
  'report.ncmec_record',
  reportNcmecRecordInput,
  async (ctx: ActionContext, input: ReportNcmecRecordInput): Promise<{ holdId: string }> => {
    const operator = await requirePermission(ctx, 'reports.review', 'report.ncmec_record')
    return withTransaction(async (client) => {
      const res = await client.query<{ id: string }>(
        `update public.legal_holds h
            set ncmec_report_number = $2, ncmec_reported_by = $3, ncmec_reported_at = $4,
                retain_until = greatest(h.retain_until, $4::timestamptz + interval '1 year')
           from public.reports r
          where r.id = $1 and h.subject_kind = r.subject_kind and h.subject_id = r.subject_id
          returning h.id`,
        [input.reportId, input.reportNumber, operator, ctx.now()],
      )
      const row = res.rows[0]
      if (!row) throw new NotFoundError('report.ncmec_record: nothing is held for that report')
      return { holdId: row.id }
    })
  },
)
