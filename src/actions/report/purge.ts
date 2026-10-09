// #491 — purging a removed photo: the irreversible deletion specified in
// docs/purge-proposal.md. Removal stays reversible; purge is a second, deliberate
// act on a photo that is ALREADY removed, and it deletes the storage object.
//
// Two handlers because the bytes are deleted between them, by the operator's own
// session (the media bucket's operator-delete policy, migration 20261007250000),
// never by a service-role key:
//   1. report.purge_target — operator only; the photo must be removed and not yet
//      purged; names the object and makes the database know the operator.
//   2. report.purge — after the object is gone: records who, what and why in
//      `photo_purges`, clears `photo_url` and stamps `photo_purged_at`.
// Deleting the bytes first and recording second means a failure in between leaves
// a removed photo whose bytes are already gone, and the purge can simply be run
// again; the reverse order could record a deletion that never happened.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { NotFoundError, ValidationError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { requirePermission } from '../_lib/staff'
import { mediaObjectPath } from '@/lib/media/object-path'
import type { ActionContext } from '../_lib/context'

export const PURGE_REASONS = ['illegal_content', 'person_did_not_agree', 'not_suitable', 'other'] as const
export type PurgeReason = (typeof PURGE_REASONS)[number]

function requireOperator(ctx: ActionContext, verb: string): Promise<string> {
  return requirePermission(ctx, 'reports.review', verb)
}

interface PhotoRow {
  photo_url: string | null
  photo_removed_at: Date | null
  photo_purged_at: Date | null
}

type Client = { query: <T>(sql: string, params: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> }

async function removedPhoto(client: Client, verb: string, groupId: string): Promise<{ row: PhotoRow; objectPath: string }> {
  const res = await client.query<PhotoRow>(
    `select photo_url, photo_removed_at, photo_purged_at from public.groups where id = $1 for update`,
    [groupId],
  )
  const row = res.rows[0]
  if (!row) throw new NotFoundError(`${verb}: Page ${groupId} not found`)
  if (row.photo_purged_at || !row.photo_url) throw new ValidationError(`${verb}: that photo is already deleted`)
  if (!row.photo_removed_at) throw new ValidationError(`${verb}: only a removed photo can be deleted: remove it first`)
  const objectPath = mediaObjectPath(row.photo_url)
  if (!objectPath) throw new ValidationError(`${verb}: the photo is not in the media bucket`)
  return { row, objectPath }
}

export const reportPurgeTargetInput = z.object({ groupId: z.string().uuid() })

export const reportPurgeTarget = defineHandler(
  'report.purge_target',
  reportPurgeTargetInput,
  async (ctx: ActionContext, input: z.infer<typeof reportPurgeTargetInput>) => {
    const operator = await requireOperator(ctx, 'report.purge_target')
    return withTransaction(async (client) => {
      const { objectPath } = await removedPhoto(client, 'report.purge_target', input.groupId)
      // The operator is an env var the database has never heard of. The storage
      // policy needs to know, so the verified operator is recorded on first use.
      await client.query(`insert into public.operators (member_id) values ($1) on conflict do nothing`, [operator])
      return { groupId: input.groupId, objectPath }
    })
  },
)

export const reportPurgeInput = z
  .object({
    groupId: z.string().uuid(),
    objectPath: z.string().min(1),
    reasonCode: z.enum(PURGE_REASONS),
    reasonNote: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((v) => v.reasonCode !== 'other' || Boolean(v.reasonNote), { message: '"other" needs a note saying what happened' })

export const reportPurge = defineHandler(
  'report.purge',
  reportPurgeInput,
  async (ctx: ActionContext, input: z.infer<typeof reportPurgeInput>) => {
    const operator = await requireOperator(ctx, 'report.purge')
    return withTransaction(async (client) => {
      const { objectPath } = await removedPhoto(client, 'report.purge', input.groupId)
      if (objectPath !== input.objectPath) throw new ValidationError('report.purge: that is not the photo on this Page')
      const now = ctx.now()
      const res = await client.query<{ id: string }>(
        `insert into public.photo_purges (group_id, purged_by_member_id, reason_code, reason_note, object_path, purged_at)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [input.groupId, operator, input.reasonCode, input.reasonNote ?? null, objectPath, now],
      )
      await client.query(
        `update public.groups set photo_url = null, photo_purged_at = $2 where id = $1`,
        [input.groupId, now],
      )
      return { purgeId: res.rows[0]!.id, groupId: input.groupId }
    })
  },
)
