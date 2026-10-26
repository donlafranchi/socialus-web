// F118 criterion 2 — a member's first name shows among the people opening their town unless they hide it.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'

export const townCreditSetInput = z.object({ hidden: z.boolean() })

export const townCreditSet = defineHandler(
  'town.credit_set',
  townCreditSetInput,
  async (ctx: ActionContext, input): Promise<{ hidden: boolean }> =>
    withTransaction(async (client) => {
      await client.query(`update public.members set open_credit_hidden = $2, updated_at = $3 where id = $1`, [ctx.actingMemberId, input.hidden, ctx.now()])
      await appendEvent({ ...ctx, db: client } as ActionContext, 'member_events', { member_id: ctx.actingMemberId, event_kind: 'member.profile_updated', payload: { open_credit_hidden: input.hidden } })
      return { hidden: input.hidden }
    }),
)
