// #1171 (socialus-plan #269, Don 2026-11-02) — a heart and a save, as separate things.
//   member.heart.set   ♡ on a post or a Page. The Page's managers see who, by name (heart_view); it subscribes no one.
//   member.save.set    keep a post for later, on You's Saved list. Private.
// Both toggle and are idempotent. Only a real, live post or Page the member may see; never a sample.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import type { ActionContext } from '../_lib/context'

export const memberHeartSetInput = z.union([
  z.object({ postId: z.string().uuid(), on: z.boolean() }).strict(),
  z.object({ groupId: z.string().uuid(), on: z.boolean() }).strict(),
])
export const memberSaveSetInput = z.object({ postId: z.string().uuid(), on: z.boolean() })
export type MemberHeartSetInput = z.infer<typeof memberHeartSetInput>

// A live post, or Page, the member may see: listed, or on a Page they belong to. Spelled out whole (T051: no interpolation).
const VISIBLE_POST = `select 1 from public.page_posts p join public.groups g on g.id = p.group_id
  where p.id = $1 and p.sample_kind is null and p.lifecycle_state = 'active' and p.dissolved_at is null
    and p.hidden_at is null and p.removed_at is null
    and (p.discoverability = 'listed'
         or exists (select 1 from public.group_memberships m where m.group_id = g.id and m.member_id = $2 and m.left_at is null))
    and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
    and (g.discoverability = 'listed'
         or exists (select 1 from public.group_memberships m where m.group_id = g.id and m.member_id = $2 and m.left_at is null))`

const VISIBLE_PAGE = `select 1 from public.groups g
  where g.id = $1 and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
    and (g.discoverability = 'listed'
         or exists (select 1 from public.group_memberships m where m.group_id = g.id and m.member_id = $2 and m.left_at is null))`

const HEART = {
  post: {
    what: 'post',
    visible: VISIBLE_POST,
    on: `insert into public.hearts (member_id, post_id, created_at) values ($1, $2, $3) on conflict (member_id, post_id) where post_id is not null do nothing`,
    off: `delete from public.hearts where member_id = $1 and post_id = $2`,
  },
  page: {
    what: 'Page',
    visible: VISIBLE_PAGE,
    on: `insert into public.hearts (member_id, group_id, created_at) values ($1, $2, $3) on conflict (member_id, group_id) where group_id is not null do nothing`,
    off: `delete from public.hearts where member_id = $1 and group_id = $2`,
  },
} as const

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') throw new AuthorizationError(`${verb}: a signed-in member is required`)
  return ctx.actingMemberId
}

export const memberHeartSet = defineHandler(
  'member.heart.set',
  memberHeartSetInput,
  async (ctx: ActionContext, input: MemberHeartSetInput): Promise<{ on: boolean }> => {
    const memberId = requireMember(ctx, 'member.heart.set')
    const [sql, target] = 'postId' in input ? ([HEART.post, input.postId] as const) : ([HEART.page, input.groupId] as const)
    return withTransaction(async (client) => {
      if (!input.on) {
        await client.query(sql.off, [memberId, target])
        return { on: false }
      }
      if (!(await client.query(sql.visible, [target, memberId])).rows[0]) throw new NotFoundError(`member.heart.set: no such ${sql.what}`)
      await client.query(sql.on, [memberId, target, ctx.now()])
      return { on: true }
    })
  },
)

export const memberSaveSet = defineHandler(
  'member.save.set',
  memberSaveSetInput,
  async (ctx: ActionContext, input: { postId: string; on: boolean }): Promise<{ on: boolean }> => {
    const memberId = requireMember(ctx, 'member.save.set')
    return withTransaction(async (client) => {
      if (!input.on) {
        await client.query(`delete from public.saves where member_id = $1 and post_id = $2`, [memberId, input.postId])
        return { on: false }
      }
      if (!(await client.query(VISIBLE_POST, [input.postId, memberId])).rows[0]) throw new NotFoundError('member.save.set: no such post')
      await client.query(`insert into public.saves (member_id, post_id, created_at) values ($1, $2, $3) on conflict do nothing`, [memberId, input.postId, ctx.now()])
      return { on: true }
    })
  },
)
