// group.update — the owner edits a Page that is already live.
//
// Don, 2026-09-18: "There is no way to edit a Page." Correct, and this is why:
// `group.update_draft` refuses any row whose lifecycle_state is not 'draft'.
// Every Page a member has finished creating is 'active', so the only update
// handler in the project rejected it by design. Nothing he made was changeable.
//
// WHAT IS DIFFERENT FROM EDITING A DRAFT, and why this is a second handler
// rather than a loosened check on the first:
//
//   · THE SLUG IS FROZEN. update_draft re-derives the slug on every rename,
//     with a random suffix, because a draft's address is not public yet. A live
//     Page's address has been shared, linked and possibly printed — moving it
//     breaks every one of those. The name changes; the address does not. That
//     is already the rule in verbs.md ("Rename an active Page's slug" is on the
//     forbidden list).
//
//   · THE EDIT IS AN EVENT. Per-step draft updates deliberately emit nothing —
//     they would flood the log. An edit to something people can already see is
//     a different act, and the Page's own history should carry it.
//
//   · A DISSOLVED PAGE IS NOT EDITABLE. update_draft lumps 'active' and
//     'dissolved' together as "not draft"; here they are distinguished, because
//     one is a state you can edit out of and the other is not.
//
// Everything else — who may write, how fields are patched, how social links are
// normalised — is deliberately identical to update_draft. Two handlers with one
// rule each beats one handler with a mode flag.

import { normalizeUsPhone } from '../../lib/phone'
import { parseOpeningHours } from '../../lib/groups/opening-hours'
import { whereInput, applyWhere, type WhereClause } from './where'
import { normalizeTag, isValidTagLabel, TAG_MAX_LENGTH, MAX_TAGS_PER_PAGE } from '../../lib/groups/tags'
import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ValidationError, AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { appendEvent } from '../_lib/event-log'
import { managingRoleForKind, type GroupKind } from './constants'
import { normaliseSocialLinks } from '../../lib/groups/social-links'
import type { ActionContext } from '../_lib/context'
import { applyTypeChange } from './change-kind'
import { PAGE_KINDS, ALL_USE_CASES, type PageKind, type UseCase } from '../../lib/groups/page-kind'
import { parseBadges, sinceMax } from '../../lib/groups/badges'

export const groupUpdateInput = z.object({
  groupId: z.string().uuid(),
  // All optional; only what is supplied is patched. `undefined` leaves a field
  // alone, an explicit `null` clears the ones that can be cleared.
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  anchorLocationId: z.string().uuid().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  // #293 — shown to signed-in visitors only. Null clears either.
  contactPhone: z.string().max(40).nullable().optional(),
  openingHours: z.unknown().optional(),
  // #285 — the whole set, replacing the old one (Don, 2026-10-01: editable any time).
  tags: z.array(z.string().max(TAG_MAX_LENGTH)).max(MAX_TAGS_PER_PAGE).optional(),
  // Don, 2026-10-04 — hours and phone as a component: on by default for
  // shops and services, off for groups until the owner adds them.
  contactComponent: z.boolean().optional(),
  // #363 — Products & services, on by default for a business; any Page may add it.
  productsComponent: z.boolean().optional(),
  // Page kinds (dispatch, 2026-10-05): changeable in settings.
  pageKind: z.enum(PAGE_KINDS as [PageKind, ...PageKind[]]).optional(),
  // #371 — the kind facts; each the owner's claim (ruled 2026-10-05).
  badges: z
    .object({
      family_owned: z.boolean().optional(),
      coop: z.boolean().optional(),
      nonprofit: z.boolean().optional(),
      free_to_join: z.boolean().optional(),
      everyone_welcome: z.boolean().optional(),
      since: z.number().int().min(1800).nullable().optional(),
    })
    .optional(),
  useCase: z.enum(ALL_USE_CASES as [UseCase, ...UseCase[]]).optional(),
}).merge(whereInput)
export type GroupUpdateInput = z.infer<typeof groupUpdateInput>

export interface GroupUpdateResult {
  groupId: string
  /** Column names actually written, so a caller can say what changed. */
  patched: string[]
}

/** Closed set. The SET clause is built from these literals, never from input. */
type SpineClause =
  | 'name = $'
  | 'description = $'
  | 'anchor_location_id = $'
  | 'photo_url = $'
  | 'category = $'
  | 'contact_phone = $'
  | 'opening_hours = $'
  | 'social_links = $'
  | WhereClause

export const groupUpdate = defineHandler(
  'group.update',
  groupUpdateInput,
  async (ctx: ActionContext, input: GroupUpdateInput): Promise<GroupUpdateResult> => {
    return withTransaction(async (client) => {
      const groupRes = await client.query<{
        id: string
        kind: string
        use_case: string | null
        lifecycle_state: string
      }>(
        `select id, kind, use_case, lifecycle_state
           from public.groups
          where id = $1
          for update`,
        [input.groupId],
      )
      const row = groupRes.rows[0]
      if (!row) throw new NotFoundError(`group.update: group ${input.groupId} not found`)

      if (row.lifecycle_state === 'draft') {
        // Not an error of the caller's making — say which handler to use.
        throw new ValidationError(
          `group.update: group ${input.groupId} is still a draft; use group.update_draft`,
        )
      }
      if (row.lifecycle_state !== 'active') {
        throw new ValidationError(
          `group.update: group ${input.groupId} is ${row.lifecycle_state} and cannot be edited`,
        )
      }

      if (!ctx.actingMemberId || ctx.actingMemberId === 'self-bootstrap') {
        throw new AuthorizationError('group.update: a signed-in member is required')
      }

      // The managing role is 'owner' for business and 'steward' for every other
      // kind. An unconditional owner check locks every non-business founder out
      // of their own Page.
      const managingRole = managingRoleForKind(row.kind as GroupKind)
      const ownerRes = await client.query<{ role: string }>(
        `select role
           from public.group_memberships
          where group_id = $1
            and member_id = $2
            and left_at is null
            and role = $3`,
        [input.groupId, ctx.actingMemberId, managingRole],
      )
      if (ownerRes.rows.length === 0) {
        throw new AuthorizationError(
          `group.update: acting member is not a ${managingRole} of group ${input.groupId}`,
        )
      }

      const patched: string[] = []
      const fragments: Array<{ clause: SpineClause; value: unknown }> = []

      if (input.name !== undefined) {
        // NAME ONLY. The slug is deliberately not re-derived — see the note at
        // the top of this file. A live address that moves is a broken link
        // somebody already shared.
        fragments.push({ clause: 'name = $', value: input.name })
        patched.push('name')
      }
      if (input.description !== undefined) {
        fragments.push({ clause: 'description = $', value: input.description })
        patched.push('description')
      }
      if (input.anchorLocationId !== undefined) {
        fragments.push({ clause: 'anchor_location_id = $', value: input.anchorLocationId })
        patched.push('anchor_location_id')
      }
      if (input.photoUrl !== undefined) {
        fragments.push({ clause: 'photo_url = $', value: input.photoUrl })
        patched.push('photo_url')
      }
      if (input.category !== undefined) {
        fragments.push({ clause: 'category = $', value: input.category })
        patched.push('category')
      }
      if (input.socialLinks !== undefined) {
        const { links, rejected } = normaliseSocialLinks(input.socialLinks)
        if (rejected.length > 0) {
          throw new ValidationError(
            `group.update: these links could not be read: ${rejected.join(', ')}`,
          )
        }
        fragments.push({ clause: 'social_links = $', value: JSON.stringify(links) })
        patched.push('social_links')
      }

      if (input.contactPhone !== undefined) {
        const phone = input.contactPhone === null ? null : normalizeUsPhone(input.contactPhone)
        if (input.contactPhone !== null && phone === null) {
          throw new ValidationError('group.update: enter a US phone number, like (916) 555-0142')
        }
        fragments.push({ clause: 'contact_phone = $', value: phone })
        patched.push('contact_phone')
      }
      if (input.openingHours !== undefined) {
        let hours
        try {
          hours = parseOpeningHours(input.openingHours)
        } catch (err) {
          throw new ValidationError(`group.update: ${(err as Error).message}`)
        }
        fragments.push({ clause: 'opening_hours = $', value: hours === null ? null : JSON.stringify(hours) })
        patched.push('opening_hours')
      }

      // At least one tag, as at publish: search matches tags, and an untagged
      // Page cannot be found by what it does.
      const tags = new Map<string, string>()
      if (input.tags !== undefined) {
        for (const label of input.tags.filter(isValidTagLabel)) {
          const n = normalizeTag(label)
          if (!tags.has(n)) tags.set(n, label.trim())
        }
        if (tags.size === 0) {
          throw new ValidationError('group.update: a Page needs at least one tag')
        }
        patched.push('tags')
      }

      if (
        (input.pageKind !== undefined || input.useCase !== undefined) &&
        (await applyTypeChange(client, input.groupId, { kind: row.kind, useCase: row.use_case }, { kind: input.pageKind, useCase: input.useCase }))
      ) {
        patched.push('kind')
      }

      if (input.badges !== undefined) {
        if (input.badges.since && input.badges.since > sinceMax()) {
          throw new ValidationError('group.update: that year has not happened yet')
        }
        await client.query(
          `update public.groups
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{badges}', $2::jsonb)
            where id = $1`,
          [input.groupId, JSON.stringify(parseBadges({ badges: input.badges }))],
        )
        patched.push('badges')
      }

      if (input.contactComponent !== undefined) {
        await client.query(
          `update public.groups
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{components}',
                    coalesce(metadata->'components', '{}'::jsonb) || jsonb_build_object('contact', $2::boolean))
            where id = $1`,
          [input.groupId, input.contactComponent],
        )
        patched.push('components')
      }
      // #348 — where it is: the answer, its notes, the towns served.
      await applyWhere(client, input.groupId, input, fragments, patched)

      if (input.productsComponent !== undefined) {
        await client.query(
          `update public.groups
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{components}',
                    coalesce(metadata->'components', '{}'::jsonb) || jsonb_build_object('products', $2::boolean))
            where id = $1`,
          [input.groupId, input.productsComponent],
        )
        patched.push('components')
      }

      if (patched.length === 0) return { groupId: input.groupId, patched }

      if (fragments.length > 0) {
        const setSql = fragments.map((f, i) => `${f.clause}${i + 1}`).join(', ')
        const whereIdx = fragments.length + 1
        // Re-assert 'active' in the WHERE: a concurrent dissolve between the
        // SELECT and this UPDATE must not be written over.
        // sql-injection-safe: enum-constrained by SpineClause
        const updateRes = await client.query(
          `update public.groups
              set ${setSql}
            where id = $${whereIdx}
              and lifecycle_state = 'active'`,
          [...fragments.map((f) => f.value), input.groupId],
        )
        if (updateRes.rowCount === 0) {
          throw new ValidationError(
            `group.update: group ${input.groupId} was no longer active at write time`,
          )
        }

        // Unlike a draft's per-step saves, an edit to something people can
        // already see belongs in the Page's history.
      }

      if (tags.size > 0) {
        for (const [normalized, label] of tags) {
          await client.query(
            `insert into public.tags (label, normalized, created_by)
             values ($1, $2, $3)
             on conflict (normalized) do nothing`,
            [label, normalized, ctx.actingMemberId],
          )
        }
        await client.query(
          `delete from public.page_tags pt
            using public.tags t
            where pt.tag_id = t.id
              and pt.group_id = $1
              and t.normalized <> all($2)`,
          [input.groupId, [...tags.keys()]],
        )
        for (const normalized of tags.keys()) {
          await client.query(
            `insert into public.page_tags (group_id, tag_id)
             select $1, t.id from public.tags t where t.normalized = $2
             on conflict (group_id, tag_id) do nothing`,
            [input.groupId, normalized],
          )
        }
      }

      await appendEvent({ ...ctx, db: client }, 'group_events', {
        group_id: input.groupId,
        event_kind: 'group.updated',
        payload: { fields: patched, by: ctx.actingMemberId },
      })

      return { groupId: input.groupId, patched }
    })
  },
)
