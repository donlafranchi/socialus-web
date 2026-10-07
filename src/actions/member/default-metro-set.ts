// #329/#330 — member.default_metro.set
//
// A member's own default metro (You page; the Explore pill follows it). Only a
// metro the platform runs can be the default. Writes the acting member's own row.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const memberDefaultMetroSetInput = z.object({ metroId: z.string().uuid() })
export type MemberDefaultMetroSetInput = z.infer<typeof memberDefaultMetroSetInput>

export interface MemberDefaultMetroSetResult {
  memberId: string
  metroId: string
  slug: string
}

export const memberDefaultMetroSet = defineHandler(
  'member.default_metro.set',
  memberDefaultMetroSetInput,
  async (ctx: ActionContext, input: MemberDefaultMetroSetInput): Promise<MemberDefaultMetroSetResult> => {
    const memberId = ctx.actingMemberId
    if (memberId === 'self-bootstrap') {
      throw new Error('member.default_metro.set: actingMemberId must be resolved before invocation')
    }
    return withTransaction(async (client) => {
      const res = await client.query<{ slug: string }>(
        `with open_metro as (
           select id, slug from public.metro_polygons where id = $1 and is_open
         )
         update public.members m
            set default_metro_id = (select id from open_metro)
          where m.id = $2 and exists (select 1 from open_metro)
          returning (select slug from open_metro) as slug`,
        [input.metroId, memberId],
      )
      if (res.rowCount === 0) throw new NotFoundError('member.default_metro.set: no such open metro')
      return { memberId, metroId: input.metroId, slug: res.rows[0]!.slug }
    })
  },
)
