// #909 — member.search_sharing.set
//
// The switch on You (F113 option C: opting out is easy). Off: this member's Explore searches are never logged.
// Their own row only; the member comes from the session, never from the caller.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const memberSearchSharingSetInput = z.object({ on: z.boolean() })
export type MemberSearchSharingSetInput = z.infer<typeof memberSearchSharingSetInput>

export const memberSearchSharingSet = defineHandler(
  'member.search_sharing.set',
  memberSearchSharingSetInput,
  async (ctx: ActionContext, input: MemberSearchSharingSetInput): Promise<{ on: boolean }> => {
    const memberId = ctx.actingMemberId
    if (!memberId || memberId === 'self-bootstrap') throw new AuthorizationError('member.search_sharing.set: a signed-in member is required')
    return withTransaction(async (client) => {
      const res = await client.query(`update public.members set search_sharing = $1 where id = $2 and deleted_at is null`, [input.on, memberId])
      if (res.rowCount === 0) throw new NotFoundError('member.search_sharing.set: no such member')
      return { on: input.on }
    })
  },
)
