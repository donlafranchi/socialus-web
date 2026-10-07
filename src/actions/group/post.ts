// F072 — group.post_create / group.post_edit
// Scenario: planning/scenario-F072.md
//
// The table and its browse read source shipped with T162; this is the write
// half.
//
// T164 SHIPPED THIS WITHOUT `starts_at`, deferring to F073. F072 absorbed F073
// on 2026-09-21 and that deferral is discharged: an announcement carries an
// optional time and an optional address of its own, and both are written here.
// A post without a time is still a first-class post — the column is nullable
// precisely so that stays true, and a time-windowed read never returns one.
//
// WHO MAY POST. Acceptance 1 says the Page's managing role, and that is not
// one role: `managingRoleForKind()` has answered since T132 that a business
// Page is managed by role='owner' and every other kind by role='steward'. A
// handler that hardcoded 'owner' would lock the founder of a run club out of
// their own Page, so the kind is read and the role derived from it through the
// same function group.create writes with. One answer, in one place.
//
// DELETE IS SOFT (#318, Don 2026-10-02, replacing F072 acceptance 4's "no
// delete"). `group.post_delete` stamps `dissolved_at`; every reader already
// filters it, so the post is hidden everywhere and the row stays for reports
// and audit. `page_posts` still carries no INSERT/UPDATE/DELETE policy, so a
// direct client write is refused by RLS; the handler is the only path.

import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { AuthorizationError, NotFoundError, ValidationError } from '../_lib/errors'
import { anyContainsEmail, EMAIL_IN_PAGE_TEXT_MESSAGE } from '../../lib/text/contact-info'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import type { ActionContext } from '../_lib/context'
import { isOwnMediaUrl } from '../../lib/media/own-media-url'
import { managingRoleForKind, type GroupKind } from './constants'

/** Matches the column's own CHECK, so a too-long body is refused before the
 *  database has to refuse it and the caller gets a message rather than a
 *  constraint name. */
const body = z.string().trim().min(1).max(5000)

/** F072 criterion 3 — OPTIONAL, and nullable on top of optional. `undefined`
 *  on an edit leaves the column alone; an explicit `null` clears it. Those are
 *  different acts: not mentioning the time is not the same as taking it off. */
const startsAt = z.string().datetime({ offset: true }).nullable().optional()
const locationId = z.string().uuid().nullable().optional()
/** #348 — an event's own meet spot, beside its place: one line. */
const howToFind = z.string().max(140).nullable().optional()
/** F099 criterion 3 — ONE photo of its own: a single URL, never a list. Null on
 *  an edit removes it; absent leaves it alone. Whose folder it sits in is
 *  checked against the acting member in the handler. */
const photoUrl = z.string().url().max(2000).nullable().optional()
const note = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim())
/** #262 — optional, only beside a start, and after it. The column's check
 *  enforces the same, so an edit that clears the start cannot strand an end. */
const endsAt = z.string().datetime({ offset: true }).nullable().optional()

const endAfterStart = (v: { startsAt?: string | null; endsAt?: string | null }) =>
  !v.endsAt || (!!v.startsAt && new Date(v.endsAt) > new Date(v.startsAt))
const END_MESSAGE = 'An end time needs a start time before it.'
const PHOTO_MESSAGE = 'That photo didn’t come from your uploads.'

export const groupPostCreateInput = z
  .object({
    groupId: z.string().uuid(),
    body,
    startsAt,
    endsAt,
    locationId,
    howToFind,
    photoUrl,
  })
  .refine(endAfterStart, { message: END_MESSAGE, path: ['endsAt'] })
export type GroupPostCreateInput = z.infer<typeof groupPostCreateInput>

export const groupPostEditInput = z.object({
  postId: z.string().uuid(),
  body,
  startsAt,
  endsAt,
  locationId,
  howToFind,
  photoUrl,
})
export type GroupPostEditInput = z.infer<typeof groupPostEditInput>

export interface GroupPostCreateResult {
  postId: string
  groupId: string
  /** The row's own timestamp, so the Page can render the new post without a
   *  round trip and without inventing a time of its own. */
  createdAt: string
}

/** An edit carries no timestamp: the post is already on screen with the one it
 *  was written at, and the row keeps its id (acceptance 4). */
export interface GroupPostEditResult {
  postId: string
  groupId: string
  /** F102: the edit showed a hidden post again (fix and repost). */
  reposted: boolean
}

/** Closed set. The SET clause is built from these literals, never from input —
 *  the same shape `group.update`'s SpineClause has, and what makes the
 *  interpolation below a safe one. */
type PostSetClause = 'starts_at = $' | 'ends_at = $' | 'location_id = $' | 'how_to_find = $' | 'photo_url = $'

interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>
}

function requireMember(ctx: ActionContext, verb: string): string {
  if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
    throw new AuthorizationError(`${verb}: a signed-in member is required`)
  }
  return ctx.actingMemberId
}

/** One round trip: the Page's kind, and this member's role on it. A LEFT JOIN
 *  so a missing Page and a missing membership stay distinguishable — the first
 *  is not found, the second is refused. */
async function requireManagingRole(
  client: Queryable,
  verb: string,
  groupId: string,
  memberId: string,
): Promise<{ discoverability: string }> {
  const found = await client.query<{ kind: string; role: string | null; discoverability: string }>(
    `select g.kind, m.role, g.discoverability
       from public.groups g
       left join public.group_memberships m
         on m.group_id = g.id and m.member_id = $2 and m.left_at is null
      where g.id = $1 and g.dissolved_at is null`,
    [groupId, memberId],
  )
  const row = found.rows[0]
  if (!row) {
    throw new NotFoundError(`${verb}: group ${groupId} not found or dissolved`)
  }
  if (row.role !== managingRoleForKind(row.kind as GroupKind)) {
    throw new AuthorizationError(`${verb}: only the people who manage this Page can post`)
  }
  return { discoverability: row.discoverability }
}

export const groupPostCreate = defineHandler(
  'group.post_create',
  groupPostCreateInput,
  async (ctx: ActionContext, input: GroupPostCreateInput): Promise<GroupPostCreateResult> => {
    // #450 — a post is public Page text; see group.update.
    if (anyContainsEmail(input.body, input.howToFind)) throw new ValidationError(EMAIL_IN_PAGE_TEXT_MESSAGE)
    const memberId = requireMember(ctx, 'group.post_create')
    if (input.photoUrl && !isOwnMediaUrl(input.photoUrl, memberId)) throw new ValidationError(PHOTO_MESSAGE)

    return withTransaction(async (client) => {
      const page = await requireManagingRole(client, 'group.post_create', input.groupId, memberId)

      // Live and listed on write. A post has no draft state of its own: the
      // owner decides to say something by saying it, and the Page's own
      // lifecycle already withholds posts of a draft Page (both halves of
      // page_posts_select_published are required).
      const inserted = await client.query<{ id: string; created_at: string | Date }>(
        `insert into public.page_posts
           (group_id, body, starts_at, location_id,
            lifecycle_state, discoverability, created_at, updated_at, ends_at, how_to_find, photo_url)
         values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)
         returning id, created_at`,
        [
          input.groupId,
          input.body,
          // `?? null` rather than passing undefined: an absent time is a null
          // column, and node-postgres would otherwise send the string
          // "undefined".
          input.startsAt ?? null,
          input.locationId ?? null,
          'active',
          // #337 — a post takes its Page's privacy, so a private Page's post is
          // never listed. Before this every post said 'listed' and only the
          // Page's own privacy kept it from a stranger.
          page.discoverability,
          ctx.now(),
          input.endsAt ?? null,
          note(input.howToFind),
          input.photoUrl ?? null,
        ],
      )
      const postId = inserted.rows[0]!.id
      const createdAt = new Date(inserted.rows[0]!.created_at).toISOString()

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.post_created',
        payload: { post_id: postId },
      })

      return { postId, groupId: input.groupId, createdAt }
    })
  },
)

export const groupPostEdit = defineHandler(
  'group.post_edit',
  groupPostEditInput,
  async (ctx: ActionContext, input: GroupPostEditInput): Promise<GroupPostEditResult> => {
    // #450 — a post is public Page text; see group.update.
    if (anyContainsEmail(input.body, input.howToFind)) throw new ValidationError(EMAIL_IN_PAGE_TEXT_MESSAGE)
    const memberId = requireMember(ctx, 'group.post_edit')
    if (input.photoUrl && !isOwnMediaUrl(input.photoUrl, memberId)) throw new ValidationError(PHOTO_MESSAGE)

    return withTransaction(async (client) => {
      const found = await client.query<{
        id: string
        group_id: string
        hidden_at: Date | null
        removed_at: Date | null
        repost_used: boolean
      }>(
        `select id, group_id, hidden_at, removed_at, repost_used from public.page_posts
          where id = $1 and dissolved_at is null`,
        [input.postId],
      )
      const post = found.rows[0]
      if (!post) {
        throw new NotFoundError(`group.post_edit: post ${input.postId} not found`)
      }

      await requireManagingRole(client, 'group.post_edit', post.group_id, memberId)

      // In place, and the row keeps its id (acceptance 4). `updated_at` moves
      // because browse orders on it; nothing else about the row changes, so an
      // edit can never quietly unpublish a post.
      //
      // The SET clause is built from a CLOSED SET of literals, never from
      // input — the same rule group.update follows. A field left out is left
      // alone; an explicit null clears it.
      const sets: string[] = ['body = $2', 'updated_at = $3']
      const params: unknown[] = [input.postId, input.body, ctx.now()]
      const patch: { clause: PostSetClause; value: unknown }[] = []
      if (input.startsAt !== undefined) {
        patch.push({ clause: 'starts_at = $', value: input.startsAt })
      }
      if (input.endsAt !== undefined) {
        patch.push({ clause: 'ends_at = $', value: input.endsAt })
      }
      if (input.locationId !== undefined) {
        patch.push({ clause: 'location_id = $', value: input.locationId })
      }
      if (input.howToFind !== undefined) {
        patch.push({ clause: 'how_to_find = $', value: note(input.howToFind) })
      }
      if (input.photoUrl !== undefined) {
        patch.push({ clause: 'photo_url = $', value: input.photoUrl })
      }
      for (const f of patch) {
        params.push(f.value)
        sets.push(`${f.clause}${params.length}`)
        // A different photo starts unhidden and unremoved; the same URL keeps
        // the state a report put it in (the Page photo's rule, scoped to the URL).
        if (f.clause === 'photo_url = $') {
          sets.push(
            `photo_hidden_at = case when $${params.length} is distinct from photo_url then null else photo_hidden_at end`,
            `photo_removed_at = case when $${params.length} is distinct from photo_url then null else photo_removed_at end`,
          )
        }
      }
      // sql-injection-safe: enum-constrained by PostSetClause
      await client.query(
        `update public.page_posts set ${sets.join(', ')} where id = $1`,
        params,
      )

      // F102 criterion 2 — fix and repost. Editing a post a report hid shows it
      // again at once, once; its reports stay on the row for review. Never after
      // a person removed it, and a second hide offers no second repost.
      const reposted = post.hidden_at !== null && post.removed_at === null && !post.repost_used
      if (reposted) {
        await client.query(
          `update public.page_posts
              set discoverability = coalesce(hidden_prior_discoverability, discoverability),
                  hidden_at = null,
                  hidden_prior_discoverability = null,
                  repost_used = true
            where id = $1`,
          [input.postId],
        )
        await client.query(
          `insert into public.report_answers (notice_id, member_id, kind)
           select id, $2, 'fix_and_repost'
             from public.member_notices
            where subject_kind = 'post' and subject_id = $1 and kind = 'content_hidden'
            order by created_at desc
            limit 1
           on conflict (notice_id) do nothing`,
          [input.postId, memberId],
        )
      }

      const txCtx: ActionContext = { ...ctx, db: client }
      await appendEvent(txCtx, 'group_events', {
        group_id: post.group_id,
        event_kind: 'group.post_edited',
        // F099 criterion 12 — removing the photo is on the record.
        payload: {
          post_id: input.postId,
          ...(reposted ? { reposted: true } : {}),
          ...(input.photoUrl === null ? { photo: 'removed' } : {}),
        },
      })

      return { postId: input.postId, groupId: post.group_id, reposted }
    })
  },
)

export const groupPostDeleteInput = z.object({ postId: z.string().uuid() })
export type GroupPostDeleteInput = z.infer<typeof groupPostDeleteInput>

export const groupPostDelete = defineHandler(
  'group.post_delete',
  groupPostDeleteInput,
  async (ctx: ActionContext, input: GroupPostDeleteInput): Promise<{ postId: string; groupId: string }> => {
    const memberId = requireMember(ctx, 'group.post_delete')

    return withTransaction(async (client) => {
      const found = await client.query<{ id: string; group_id: string }>(
        `select id, group_id from public.page_posts
          where id = $1 and dissolved_at is null`,
        [input.postId],
      )
      const post = found.rows[0]
      if (!post) {
        throw new NotFoundError(`group.post_delete: post ${input.postId} not found`)
      }

      await requireManagingRole(client, 'group.post_delete', post.group_id, memberId)

      await client.query(
        `update public.page_posts set dissolved_at = $2 where id = $1 and dissolved_at is null`,
        [input.postId, ctx.now()],
      )

      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: post.group_id,
        event_kind: 'group.post_deleted',
        payload: { post_id: input.postId },
      })

      return { postId: input.postId, groupId: post.group_id }
    })
  },
)
