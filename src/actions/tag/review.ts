// #287 — tags are moderated after they appear (Don, 2026-10-01). A new tag
// shows at once and waits as needs_review; the operator marks it safe or
// unsafe. Unsafe hides it (status 'hidden'), so it stops steering search and
// display while its rows stay, and marking it safe again restores it.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { requirePermission } from '../_lib/staff'
import type { ActionContext } from '../_lib/context'

export const tagReviewInput = z.object({
  tagId: z.string().uuid(),
  verdict: z.enum(['safe', 'unsafe']),
})
export type TagReviewInput = z.infer<typeof tagReviewInput>

export const tagReview = defineHandler(
  'tag.review',
  tagReviewInput,
  async (ctx: ActionContext, input: TagReviewInput): Promise<{ tagId: string }> => {
    await requirePermission(ctx, 'tags.review', 'tag.review')
    return withTransaction(async (client) => {
      const res = await client.query<{ id: string }>(
        `update public.tags
            set review = $2, status = $3, reviewed_by_member_id = $4, reviewed_at = $5
          where id = $1
          returning id`,
        [input.tagId, input.verdict, input.verdict === 'unsafe' ? 'hidden' : 'visible', ctx.actingMemberId, ctx.now()],
      )
      if (res.rows.length === 0) throw new NotFoundError(`tag.review: tag ${input.tagId} not found`)
      return { tagId: input.tagId }
    })
  },
)
