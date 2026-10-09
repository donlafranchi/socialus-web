// #388 — builder content, all at once (Don, 2026-10-05: one person with a day
// job, so global actions). Operator-only, checked here; absence of a button is
// not authorization. The SQL lives in 20261005140000_builder_content_switch.sql
// so the GitHub workflow runs exactly the same thing.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { withTransaction } from '../_lib/db'
import { requirePermission } from '../_lib/staff'
import type { ActionContext } from '../_lib/context'

function requireOperator(ctx: ActionContext, verb: string): Promise<string> {
  return requirePermission(ctx, 'builders.manage', verb)
}

export const builderContentSetVisibleInput = z.object({ visible: z.boolean() })

/** The switch: on shows builder content to members, off hides it. Instant and reversible. */
export const builderContentSetVisible = defineHandler(
  'builder.content_set_visible',
  builderContentSetVisibleInput,
  async (ctx: ActionContext, input): Promise<{ visible: boolean }> => {
    const operator = await requireOperator(ctx, 'builder.content_set_visible')
    return withTransaction(async (client) => {
      await client.query(
        `update public.builder_content set visible = $1, changed_at = $2, changed_by = $3`,
        [input.visible, ctx.now(), operator],
      )
      return { visible: input.visible }
    })
  },
)

// The one extra confirm is in the input: a caller must say DELETE.
export const builderContentDeleteAllInput = z.object({ confirm: z.literal('DELETE') })

export type BuilderContentDeleted = Record<
  'pages' | 'items' | 'follows' | 'memberships' | 'responses' | 'reports' | 'locations',
  number
>

/** Every row a builder account made. Permanent. The accounts stay. */
export const builderContentDeleteAll = defineHandler(
  'builder.content_delete_all',
  builderContentDeleteAllInput,
  async (ctx: ActionContext): Promise<BuilderContentDeleted> => {
    await requireOperator(ctx, 'builder.content_delete_all')
    return withTransaction(async (client) => {
      const res = await client.query<{ deleted: BuilderContentDeleted }>(
        `select public.delete_builder_content() as deleted`,
        [],
      )
      return res.rows[0]!.deleted
    })
  },
)
