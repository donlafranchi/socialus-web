// T070 — group.update_draft handler
// Source: development/tickets/T070-* § Action handler `group.update_draft`
// Spec:   product/systems/groups.md § Action handlers (2026-05-31 amendment)
//
// Per-step composer update. Mutates a `groups` row where lifecycle_state='draft'
// AND the caller holds the Group's managing role (T132 — 'owner' for
// business, 'steward' otherwise; see managingRoleForKind). For kind='business',
// the same handler also patches group_businesses fields in the same transaction.
//
// Refuses (ValidationError) if the row is not in 'draft' state — activate'd
// or dissolved rows mutate through their own surface-specific handlers.
//
// No event emitted for per-step updates: would flood the event log; the
// eventual group.activated event carries the final activated state.

import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { defineHandler } from '../_lib/handler'
import { ValidationError, AuthorizationError, NotFoundError } from '../_lib/errors'
import { withTransaction } from '../_lib/db'
import { toSlug } from '../../lib/slugify'
import { managingRoleForKind, type GroupKind } from './constants'
import { normaliseSocialLinks } from '../../lib/groups/social-links'
import { normalizeTag, isValidTagLabel, TAG_MAX_LENGTH, MAX_TAGS_PER_PAGE } from '../../lib/groups/tags'
import type { ActionContext } from '../_lib/context'
import { applyTypeChange } from './change-kind'
import { PAGE_KINDS, ALL_USE_CASES, type PageKind, type UseCase } from '../../lib/groups/page-kind'
import { parseBadges, sinceMax } from '../../lib/groups/badges'

export const groupUpdateDraftInput = z.object({
  groupId: z.string().uuid(),
  // Spine-row patchable fields. All optional; the handler patches only what's supplied.
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  anchorLocationId: z.string().uuid().nullable().optional(),
  // F070 · T145 — the Page's photo. `null` clears it; `undefined` leaves it
  // alone. The composer needs both: removing a photo is a deliberate act and
  // is not the same as advancing past the step without touching it.
  //
  // A URL, not a file: uploading is the browser's job (`lib/media/upload-image`
  // resizes, re-encodes and puts the object in the media bucket), and this
  // handler records where it landed. Keeping the bytes out of the action layer
  // is what lets the same handler serve the composer and any later surface.
  photoUrl: z.string().url().nullable().optional(),
  // F070 — the Page's links out, {platform: https-url}. Validated here and
  // again by the CHECK constraints on the column: this layer explains, the
  // database refuses. The value is rendered as href on a public Page, so an
  // unsafe scheme is an XSS vector wearing a platform label.
  socialLinks: z.record(z.string(), z.string()).optional(),
  // #301 — the whole set, replacing the old one. Set on the draft Page and
  // required at publish (group.activate checks), so none is fine here.
  tags: z.array(z.string().max(TAG_MAX_LENGTH)).max(MAX_TAGS_PER_PAGE).optional(),
  // group_businesses patches (only meaningful for kind='business' rows; the
  // handler skips them silently if the underlying Group is a community kind).
  businessDisplayName: z.string().min(1).max(120).optional(),
  businessPublicDescription: z.string().max(4000).optional(),
  businessLegalEntityKind: z
    .enum(['llc', 'sole_prop', 'partnership', 'other'])
    .nullable()
    .optional(),
  businessStateOfFormation: z.string().max(80).nullable().optional(),
  // Don, 2026-10-04 — hours and phone as a component (see group.update).
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
})

export type GroupUpdateDraftInput = z.infer<typeof groupUpdateDraftInput>

export interface GroupUpdateDraftResult {
  groupId: string
  patchedFields: string[]
}

// Closed enums of allowed SET clauses, enforced by TypeScript. The dynamic
// SET-clause builder below interpolates these literals into the query string;
// the type narrows what can possibly land there, which is what the action-
// layer Rule-4 conformance check requires.
type GroupSpineSetClause =
  | 'name = $'
  | 'slug = $'
  | 'description = $'
  | 'anchor_location_id = $'
  | 'photo_url = $'
  | 'social_links = $'
type GroupBusinessSetClause =
  | 'display_name = $'
  | 'public_description = $'
  | 'legal_entity_kind = $'
  | 'state_of_formation = $'

export const groupUpdateDraft = defineHandler(
  'group.update_draft',
  groupUpdateDraftInput,
  async (
    ctx: ActionContext,
    input: GroupUpdateDraftInput,
  ): Promise<GroupUpdateDraftResult> => {
    return withTransaction(async (client) => {
      // Load the row + verify (a) it exists, (b) it's in draft state, (c) caller
      // is an owner. Three refusals, three distinct error codes.
      const groupRes = await client.query<{
        id: string
        kind: string
        use_case: string | null
        lifecycle_state: string
      }>(
        `select id, kind, use_case, lifecycle_state
           from public.groups
          where id = $1`,
        [input.groupId],
      )
      const row = groupRes.rows[0]
      if (!row) {
        throw new NotFoundError(`group.update_draft: group ${input.groupId} not found`)
      }
      if (row.lifecycle_state !== 'draft') {
        throw new ValidationError(
          `group.update_draft: group ${input.groupId} is in lifecycle_state '${row.lifecycle_state}', not 'draft'`,
        )
      }

      // Owner check.
      if (ctx.actingMemberId === 'self-bootstrap') {
        throw new AuthorizationError(
          'group.update_draft: self-bootstrap acting member is not permitted; resolve to a real member first',
        )
      }
      // T132 — the managing role is 'owner' for business, 'steward' for every
      // other kind (groups.md § Roles per kind). A non-business founder holds
      // 'steward', never 'owner' — an unconditional owner check here would
      // lock every non-business founder out of their own draft.
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
          `group.update_draft: acting member ${ctx.actingMemberId} is not a ${managingRole} of group ${input.groupId}`,
        )
      }

      const patched: string[] = []

      // Spine-row patches. Build SET fragments from the closed GroupSpineSetClause
      // enum + a parameter index. The enum literal is everything up to the `$`;
      // we append the index inline. Conformance Rule-4 reads the enum as the
      // safety contract.
      const spineFragments: Array<{ clause: GroupSpineSetClause; value: unknown }> = []
      if (input.name !== undefined) {
        spineFragments.push({ clause: 'name = $', value: input.name })
        // Re-derive slug whenever name changes. Random suffix matches create.ts —
        // draft slugs aren't publicly visible (RLS hides drafts), but the slug
        // column is UNIQUE so concurrent renames to the same name across
        // different drafts must not collide. The user-facing final slug is
        // group.activate's concern (ADR-22).
        const slugBase = toSlug(input.name) || 'draft'
        spineFragments.push({
          clause: 'slug = $',
          value: `${slugBase}-${randomBytes(4).toString('hex')}`,
        })
        patched.push('name', 'slug')
      }
      if (input.description !== undefined) {
        spineFragments.push({ clause: 'description = $', value: input.description })
        patched.push('description')
      }
      if (input.anchorLocationId !== undefined) {
        spineFragments.push({
          clause: 'anchor_location_id = $',
          value: input.anchorLocationId,
        })
        patched.push('anchor_location_id')
      }
      // Photo. `!== undefined` rather than a truthiness check, so an explicit
      // null clears the column instead of being silently skipped.
      if (input.photoUrl !== undefined) {
        spineFragments.push({ clause: 'photo_url = $', value: input.photoUrl })
        patched.push('photo_url')
      }

      // Social links. Normalised rather than trusted: unknown platforms are
      // dropped and an unsafe URL is refused outright, because the column is
      // read straight into an href.
      if (input.socialLinks !== undefined) {
        const { links, rejected } = normaliseSocialLinks(input.socialLinks)
        if (rejected.length > 0) {
          throw new ValidationError(
            `group.update_draft: these links are not https URLs and were refused: ${rejected.join(', ')}`,
          )
        }
        spineFragments.push({ clause: 'social_links = $', value: JSON.stringify(links) })
        patched.push('social_links')
      }

      if (spineFragments.length > 0) {
        const setSql = spineFragments
          .map((f, i) => `${f.clause}${i + 1}`)
          .join(', ')
        const whereIdx = spineFragments.length + 1
        // TOCTOU guard: re-assert lifecycle_state='draft' in the WHERE clause.
        // The SELECT above checked, but a concurrent group.activate could have
        // promoted draft → active between the check and this UPDATE; without
        // the re-assertion we'd silently mutate an active row.
        // sql-injection-safe: enum-constrained by GroupSpineSetClause
        const updateRes = await client.query(
          `update public.groups
              set ${setSql}
            where id = $${whereIdx}
              and lifecycle_state = 'draft'`,
          [...spineFragments.map((f) => f.value), input.groupId],
        )
        if (updateRes.rowCount === 0) {
          throw new ValidationError(
            `group.update_draft: group ${input.groupId} was no longer in draft state at write time (concurrent activate?)`,
          )
        }
      }

      // group_businesses patches (skipped silently for community kinds; the
      // composer caller is responsible for not sending business fields to a
      // non-business draft).
      if (row.kind === 'business') {
        const bizFragments: Array<{
          clause: GroupBusinessSetClause
          value: unknown
        }> = []
        if (input.businessDisplayName !== undefined) {
          bizFragments.push({
            clause: 'display_name = $',
            value: input.businessDisplayName,
          })
          patched.push('business_display_name')
        }
        if (input.businessPublicDescription !== undefined) {
          bizFragments.push({
            clause: 'public_description = $',
            value: input.businessPublicDescription,
          })
          patched.push('business_public_description')
        }
        if (input.businessLegalEntityKind !== undefined) {
          bizFragments.push({
            clause: 'legal_entity_kind = $',
            value: input.businessLegalEntityKind,
          })
          patched.push('business_legal_entity_kind')
        }
        if (input.businessStateOfFormation !== undefined) {
          bizFragments.push({
            clause: 'state_of_formation = $',
            value: input.businessStateOfFormation,
          })
          patched.push('business_state_of_formation')
        }
        if (bizFragments.length > 0) {
          const setSql = bizFragments
            .map((f, i) => `${f.clause}${i + 1}`)
            .join(', ')
          const whereIdx = bizFragments.length + 1
          // TOCTOU guard: gate the group_businesses UPDATE on the parent row's
          // lifecycle_state = 'draft' via a subquery. Mirrors the spine-row
          // guard above so a concurrent activate doesn't smuggle business-field
          // edits into an already-active Group.
          // sql-injection-safe: enum-constrained by GroupBusinessSetClause
          const bizRes = await client.query(
            `update public.group_businesses
                set ${setSql}
              where group_id = $${whereIdx}
                and exists (
                  select 1
                    from public.groups g
                   where g.id = group_businesses.group_id
                     and g.lifecycle_state = 'draft'
                )`,
            [...bizFragments.map((f) => f.value), input.groupId],
          )
          if (bizRes.rowCount === 0) {
            throw new ValidationError(
              `group.update_draft: group ${input.groupId} was no longer in draft state at business-field write time (concurrent activate?)`,
            )
          }
        }
      }

      if (input.tags !== undefined) {
        const tags = new Map<string, string>()
        for (const label of input.tags.filter(isValidTagLabel)) {
          const n = normalizeTag(label)
          if (!tags.has(n)) tags.set(n, label.trim())
        }
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
          throw new ValidationError('group.update_draft: that year has not happened yet')
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
            where id = $1 and lifecycle_state = 'draft'`,
          [input.groupId, input.contactComponent],
        )
        patched.push('components')
      }

      if (input.productsComponent !== undefined) {
        await client.query(
          `update public.groups
              set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{components}',
                    coalesce(metadata->'components', '{}'::jsonb) || jsonb_build_object('products', $2::boolean))
            where id = $1 and lifecycle_state = 'draft'`,
          [input.groupId, input.productsComponent],
        )
        patched.push('components')
      }

      return { groupId: input.groupId, patchedFields: patched }
    })
  },
)
