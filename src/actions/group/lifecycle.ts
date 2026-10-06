// #423 — the PM, 2026-10-06: the owner archives, deletes and restores their
// own Page. Path: well-worn (Facebook Pages unpublish and delete with 14 days
// to change your mind; Etsy vacation mode and close shop; Google Business
// Profile mark closed and remove).
//
//   archive  active → archived. Hidden from everyone but the owner (RLS,
//            groups_hidden_owner_only), restorable any time.
//   delete   active|archived → dissolved, dissolved_at now, delete_after 14
//            days on. purge_deleted_pages() removes it, with its posts, after.
//   restore  archived, or dissolved before delete_after → active, with both
//            timestamps cleared.
//
// The managing role is checked here, not only by the Edit Page that offers
// the buttons.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { managingRoleForKind, type GroupKind } from './constants'
import type { ActionContext } from '../_lib/context'
import type { PoolClient } from 'pg'
import { DELETE_GRACE_DAYS, removalDateFrom } from '../../lib/groups/page-removal'

export { DELETE_GRACE_DAYS }

export type PageLifecycleState = 'active' | 'archived' | 'dissolved'

export interface GroupLifecycleResult {
  groupId: string
  lifecycleState: PageLifecycleState
  deleteAfter: Date | null
}

interface Row {
  id: string
  kind: string
  name: string
  lifecycle_state: string
  delete_after: Date | null
  role: string | null
}

async function lockOwnPage(client: PoolClient, ctx: ActionContext, verb: string, groupId: string): Promise<Row> {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
    throw new AuthorizationError(`${verb}: a signed-in member is required`)
  }
  const res = await client.query<Row>(
    `select g.id, g.kind, g.name, g.lifecycle_state, g.delete_after, m.role
       from public.groups g
       left join public.group_memberships m
         on m.group_id = g.id and m.member_id = $2 and m.left_at is null
      where g.id = $1
      for update of g`,
    [groupId, ctx.actingMemberId],
  )
  const row = res.rows[0]
  if (!row) throw new NotFoundError(`${verb}: group ${groupId} not found`)
  if (row.role !== managingRoleForKind(row.kind as GroupKind)) {
    throw new AuthorizationError(`${verb}: only the people who manage this Page can do this`)
  }
  return row
}

const groupIdInput = z.object({ groupId: z.string().uuid() })
export type GroupArchiveInput = z.infer<typeof groupIdInput>

export const groupArchive = defineHandler(
  'group.archive',
  groupIdInput,
  async (ctx: ActionContext, input: GroupArchiveInput): Promise<GroupLifecycleResult> =>
    withTransaction(async (client) => {
      const row = await lockOwnPage(client, ctx, 'group.archive', input.groupId)
      if (row.lifecycle_state !== 'active') {
        throw new ValidationError(`group.archive: group ${input.groupId} is ${row.lifecycle_state}; only a live Page can be archived`)
      }
      await client.query(
        `update public.groups set lifecycle_state = 'archived' where id = $1 and lifecycle_state = 'active'`,
        [input.groupId],
      )
      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.archived',
        payload: { by: ctx.actingMemberId },
      })
      return { groupId: input.groupId, lifecycleState: 'archived', deleteAfter: null }
    }),
)

export const groupDeleteInput = z.object({
  groupId: z.string().uuid(),
  /** The Page name as the owner typed it. Must match exactly. */
  confirmName: z.string(),
})
export type GroupDeleteInput = z.infer<typeof groupDeleteInput>

export const groupDelete = defineHandler(
  'group.delete',
  groupDeleteInput,
  async (ctx: ActionContext, input: GroupDeleteInput): Promise<GroupLifecycleResult> =>
    withTransaction(async (client) => {
      const row = await lockOwnPage(client, ctx, 'group.delete', input.groupId)
      if (row.lifecycle_state !== 'active' && row.lifecycle_state !== 'archived') {
        throw new ValidationError(`group.delete: group ${input.groupId} is ${row.lifecycle_state} and cannot be deleted`)
      }
      if (input.confirmName !== row.name) {
        throw new ValidationError('group.delete: the name typed does not match the Page name')
      }
      const now = ctx.now()
      const deleteAfter = removalDateFrom(now)
      await client.query(
        `update public.groups
            set lifecycle_state = 'dissolved', dissolved_at = $2, delete_after = $3
          where id = $1 and lifecycle_state in ('active', 'archived')`,
        [input.groupId, now, deleteAfter],
      )
      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.dissolved',
        payload: { by: ctx.actingMemberId, from: row.lifecycle_state, delete_after: deleteAfter.toISOString() },
      })
      return { groupId: input.groupId, lifecycleState: 'dissolved', deleteAfter }
    }),
)

export type GroupRestoreInput = z.infer<typeof groupIdInput>

export const groupRestore = defineHandler(
  'group.restore',
  groupIdInput,
  async (ctx: ActionContext, input: GroupRestoreInput): Promise<GroupLifecycleResult> =>
    withTransaction(async (client) => {
      const row = await lockOwnPage(client, ctx, 'group.restore', input.groupId)
      const inGrace =
        row.lifecycle_state === 'dissolved' && row.delete_after !== null && new Date(row.delete_after) > ctx.now()
      if (row.lifecycle_state !== 'archived' && !inGrace) {
        throw new ValidationError(`group.restore: group ${input.groupId} cannot be restored`)
      }
      await client.query(
        `update public.groups
            set lifecycle_state = 'active', dissolved_at = null, delete_after = null
          where id = $1 and lifecycle_state in ('archived', 'dissolved')`,
        [input.groupId],
      )
      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.restored',
        payload: { by: ctx.actingMemberId, from: row.lifecycle_state },
      })
      return { groupId: input.groupId, lifecycleState: 'active', deleteAfter: null }
    }),
)
