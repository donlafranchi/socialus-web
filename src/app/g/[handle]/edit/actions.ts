'use server'

// The edit form's server action.
//
// Authorization is NOT here. `group.update` re-checks the managing role for the
// Page's kind, so a POST from someone who found this URL is refused whatever
// rendered. This resolves who is calling and hands off.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupUpdate, ActionError } from '@/actions'

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
}

export async function editPageAction(input: EditPageInput): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')

  const ctx = resolveActionContext({ actingMemberId: data.user.id })
  try {
    await groupUpdate(ctx, {
      groupId: input.groupId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.socialLinks !== undefined ? { socialLinks: input.socialLinks } : {}),
      ...(input.anchorLocationId !== undefined
        ? { anchorLocationId: input.anchorLocationId }
        : {}),
    })
  } catch (err) {
    // The handler's message is written to be read by the owner — "these links
    // could not be read: instagram" — so it is passed through rather than
    // replaced with a generic failure. A save that fails should say why.
    throw err instanceof ActionError ? new Error(err.message) : err
  }

  revalidatePath(input.pagePath)
  return { ok: true }
}
