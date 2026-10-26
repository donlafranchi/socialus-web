// #892 — member.interests.remove handler: the pair of member.interests.add.
//
// Removes the acting Member's own tags. Idempotent: a tag they do not hold is skipped and emits nothing.
// One member.interest_removed event per deleted row, in the same transaction (ADR-7 row+event invariant).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'
import { memberInterestsAddInput } from './interests-add'

export const memberInterestsRemoveInput = memberInterestsAddInput

export type MemberInterestsRemoveInput = z.infer<typeof memberInterestsRemoveInput>

export interface MemberInterestsRemoveResult {
  memberId: string
  removedTags: string[]
}

export const memberInterestsRemove = defineHandler(
  'member.interests.remove',
  memberInterestsRemoveInput,
  async (ctx: ActionContext, input: MemberInterestsRemoveInput): Promise<MemberInterestsRemoveResult> => {
    const memberId = ctx.actingMemberId
    if (memberId === 'self-bootstrap') {
      throw new Error('member.interests.remove: actingMemberId must be resolved before invocation')
    }
    const tags = Array.from(new Set(input.tags))

    return withTransaction(async (client) => {
      const txCtx: ActionContext = { ...ctx, db: client }
      const removedTags: string[] = []
      for (const t of tags) {
        const res = await client.query<{ tag: string }>(
          `delete from public.member_interests where member_id = $1 and tag = $2 returning tag`,
          [memberId, t],
        )
        if (res.rowCount && res.rowCount > 0) {
          removedTags.push(t)
          await appendEvent(txCtx, 'member_events', {
            member_id: memberId,
            event_kind: 'member.interest_removed',
            payload: { tag: t },
          })
        }
      }
      return { memberId, removedTags }
    })
  },
)
