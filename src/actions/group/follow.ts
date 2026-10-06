// F067 — group.follow / group.unfollow
// Scenario: planning/scenario-F067.md
//
// `member_follows` is member-to-member only, so a Page could not be followed
// at all. This adds the verb on the row that already models attachment to a
// Page, rather than a second table.
//
// PRIVACY DECIDES WHICH RELATIONSHIP IS WRITTEN (Don, 2026-09-15):
// a private Page is joined as a member, anything else is followed. F067
// acceptance 1 keyed this on kind; that is superseded. A bakery and a run club
// can both be open to anyone, and what differs is whether the thing is closed.
//
// The `source` written alongside is load-bearing, not cosmetic.
// `memberships_select_listed_group` returns rows only where
// source = 'explicit'. Writing a follower as 'soft_via_follow' is therefore
// what keeps an open Page's follower list unreadable by anyone, which is F067
// acceptance 2 — satisfied by the policy already in place rather than by a new
// one. A member of a private Page is 'explicit', so co-members stay visible to
// each other through current_member_explicit_group_ids() (acceptance 3).
//
// Neither relationship grants anything. Both rows carry role='member', so
// every guard rail F065 established still holds (acceptance 4).

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'

export type Relationship = 'member' | 'follower'

export const groupFollowInput = z.object({ groupId: z.string().uuid() })
export type GroupFollowInput = z.infer<typeof groupFollowInput>

export interface GroupFollowResult {
  groupId: string
  relationship: Relationship
}

/** A closed thing is joined; an open one is followed. */
export function relationshipFor(discoverability: string): Relationship {
  return discoverability === 'private' ? 'member' : 'follower'
}

/** Followers must not land in memberships_select_listed_group. */
function sourceFor(relationship: Relationship): 'explicit' | 'soft_via_follow' {
  return relationship === 'member' ? 'explicit' : 'soft_via_follow'
}

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
    throw new AuthorizationError(`${verb}: a signed-in member is required`)
  }
  return ctx.actingMemberId
}

export const groupFollow = defineHandler(
  'group.follow',
  groupFollowInput,
  async (ctx: ActionContext, input: GroupFollowInput): Promise<GroupFollowResult> => {
    const memberId = requireMember(ctx, 'group.follow')

    return withTransaction(async (client) => {
      const grp = await client.query<{ id: string; discoverability: string }>(
        `select id, discoverability from public.groups
          where id = $1 and dissolved_at is null and lifecycle_state <> 'archived'`,
        [input.groupId],
      )
      const row = grp.rows[0]
      if (!row) {
        throw new NotFoundError(`group.follow: group ${input.groupId} not found or dissolved`)
      }

      const relationship = relationshipFor(row.discoverability)
      const source = sourceFor(relationship)

      // Upsert, mirroring group.member_join: a re-follow revives the soft-left
      // row rather than inserting a second one, and does not reset the role —
      // an owner who followed their own Page does not get downgraded.
      await client.query(
        `insert into public.group_memberships
           (group_id, member_id, role, source, relationship, joined_at, left_at)
         values ($1, $2, 'member', $3, $4, $5, null)
         on conflict (group_id, member_id)
         do update set left_at = null, relationship = excluded.relationship
         -- #267: a managing row is the owner's authority; following leaves it be.
         where public.group_memberships.role not in ('owner', 'steward')`,
        [input.groupId, memberId, source, relationship, ctx.now()],
      )

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.member_joined',
        payload: { member_id: memberId, source, relationship },
      })

      return { groupId: input.groupId, relationship }
    })
  },
)

export const groupUnfollowInput = groupFollowInput
export type GroupUnfollowInput = GroupFollowInput
export interface GroupUnfollowResult {
  groupId: string
}

export const groupUnfollow = defineHandler(
  'group.unfollow',
  groupUnfollowInput,
  async (ctx: ActionContext, input: GroupUnfollowInput): Promise<GroupUnfollowResult> => {
    const memberId = requireMember(ctx, 'group.unfollow')

    return withTransaction(async (client) => {
      // Soft-leave, per the project's no-hard-deletes rule. Re-following
      // revives this row, which is what makes Undo cheap.
      await client.query(
        `update public.group_memberships
            set left_at = $3
          where group_id = $1 and member_id = $2 and left_at is null
            -- #267: unfollowing never ends the row that holds a Page's
            -- authority. Leaving a Page you run is not an unfollow.
            and role not in ('owner', 'steward')`,
        [input.groupId, memberId, ctx.now()],
      )

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.member_left',
        payload: { member_id: memberId },
      })

      return { groupId: input.groupId }
    })
  },
)
