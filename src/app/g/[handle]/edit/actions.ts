'use server'

// The edit form's server action.
//
// Authorization is NOT here. `group.update` re-checks the managing role for the
// Page's kind, so a POST from someone who found this URL is refused whatever
// rendered. This resolves who is calling and hands off.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupUpdate, groupUpdateDraft, ActionError } from '@/actions'

export interface EditPageInput {
  groupId: string
  pagePath: string
  name?: string
  description?: string
  photoUrl?: string | null
  socialLinks?: Record<string, string>
  /** Issue #180 — where the Page is. `group.update` already accepted this;
   *  nothing but the form was missing. */
  anchorLocationId?: string
  /** #348 — where it is. */
  whereMode?: 'visit' | 'travel' | 'roaming'
  howToFind?: string | null
  usuallyAround?: string | null
  serviceAreaPlaceIds?: string[]
  /** #293 — null clears either. */
  contactPhone?: string | null
  openingHours?: unknown
  /** Don, 2026-10-04 — hours and phone switched on or off. */
  contactComponent?: boolean
  /** Page types (ruled 2026-10-05). */
  pageKind?: 'business' | 'group'
  useCase?: 'selling' | 'service' | 'gathering' | 'testing_interest'
  /** #363 — Products & services switched on or off. */
  productsComponent?: boolean
  /** #285 — the Page's whole tag set. */
  tags?: string[]
}

export type EditPageResult = { ok: true } | { ok: false; message: string }

// Returns its failure rather than throwing it: Next redacts a thrown message in
// production to a generic render error with a digest (#231).
export async function editPageAction(input: EditPageInput): Promise<EditPageResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, message: 'You must be signed in.' }

  const ctx = resolveActionContext({ actingMemberId: data.user.id })
  // #301 — a draft is finished on its own Page, so Edit serves drafts too;
  // a draft writes through group.update_draft, which group.update refuses.
  // A shop draft keeps its name and description on group_businesses, which
  // the Page reads and group.activate checks.
  const { data: row } = await supabase.from('groups').select('lifecycle_state, kind').eq('id', input.groupId).maybeSingle()
  const r = row as { lifecycle_state?: string; kind?: string } | null
  const isDraft = r?.lifecycle_state === 'draft'
  const save = isDraft ? groupUpdateDraft : groupUpdate
  const shopDraft = isDraft && r?.kind === 'business'

  try {
    await save(ctx, {
      groupId: input.groupId,
      ...(shopDraft && input.name !== undefined ? { businessDisplayName: input.name } : {}),
      ...(shopDraft && input.description !== undefined ? { businessPublicDescription: input.description } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
      ...(input.openingHours !== undefined ? { openingHours: input.openingHours } : {}),
      ...(input.contactComponent !== undefined ? { contactComponent: input.contactComponent } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.pageKind !== undefined ? { pageKind: input.pageKind } : {}),
      ...(input.useCase !== undefined ? { useCase: input.useCase } : {}),
      ...(input.productsComponent !== undefined ? { productsComponent: input.productsComponent } : {}),
      ...(input.whereMode !== undefined ? { whereMode: input.whereMode } : {}),
      ...(input.howToFind !== undefined ? { howToFind: input.howToFind } : {}),
      ...(input.usuallyAround !== undefined ? { usuallyAround: input.usuallyAround } : {}),
      ...(input.serviceAreaPlaceIds !== undefined ? { serviceAreaPlaceIds: input.serviceAreaPlaceIds } : {}),
      ...(input.anchorLocationId !== undefined
        ? { anchorLocationId: input.anchorLocationId }
        : {}),
    })
  } catch (err) {
    // The handler's message is written to be read by the owner — "these links
    // could not be read: instagram" — so it is passed through. Anything else is
    // ours to read in the logs, not theirs.
    if (err instanceof ActionError) return { ok: false, message: err.message }
    console.error('editPageAction failed', err)
    return { ok: false, message: "That didn't save. Nothing on your Page changed — try again." }
  }

  revalidatePath(input.pagePath)
  return { ok: true }
}
