// #222 (F081) — member.signup_profile.set
//
// What signup collects, written to the acting member's own row: legal name,
// display name, zip, the 18+ confirmation, and the home metro the zip decided
// (null when the zip has no metro: nothing is guessed, F081 criterion 3/7).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const memberSignupProfileSetInput = z.object({
  legalName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(1).max(60),
  zip: z.string().regex(/^[0-9]{5}$/),
  adultConfirmed: z.literal(true),
  metroId: z.string().uuid().nullable(),
})
export type MemberSignupProfileSetInput = z.infer<typeof memberSignupProfileSetInput>

export interface MemberSignupProfileSetResult {
  memberId: string
  metroId: string | null
}

export const memberSignupProfileSet = defineHandler(
  'member.signup_profile.set',
  memberSignupProfileSetInput,
  async (ctx: ActionContext, input: MemberSignupProfileSetInput): Promise<MemberSignupProfileSetResult> => {
    const memberId = ctx.actingMemberId
    if (memberId === 'self-bootstrap') {
      throw new Error('member.signup_profile.set: actingMemberId must be resolved before invocation')
    }
    return withTransaction(async (client) => {
      const res = await client.query(
        `update public.members
            set legal_name = $1, display_name = $2, zip = $3,
                home_metro_id = $4, adult_confirmed_at = now()
          where id = $5 and deleted_at is null
          returning id`,
        [input.legalName, input.displayName, input.zip, input.metroId, memberId],
      )
      if (res.rowCount === 0) throw new NotFoundError('member.signup_profile.set: no such member')
      return { memberId, metroId: input.metroId }
    })
  },
)
