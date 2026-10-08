// F102 criterion 13 — every upload and every post records the address and time
// it came from, so abuse and legal requests can be traced. Operator-only, kept
// one year then deleted (public.purge_content_origins), shown to no member and
// used by no feature outside the report path.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const originRecordInput = z.object({
  kind: z.enum(['post', 'upload']),
  /** The post's id, or the uploaded object's URL. */
  ref: z.string().min(1).max(500),
  ip: z.string().max(45).nullable(),
})
export type OriginRecordInput = z.infer<typeof originRecordInput>

export const originRecord = defineHandler(
  'origin.record',
  originRecordInput,
  async (ctx: ActionContext, input: OriginRecordInput): Promise<void> => {
    if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
      throw new AuthorizationError('origin.record: a signed-in member is required')
    }
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.content_origins (member_id, kind, ref, ip, created_at) values ($1, $2, $3, $4, $5)`,
        [ctx.actingMemberId, input.kind, input.ref, input.ip, ctx.now()],
      )
    })
  },
)
