'use server'

// F072 — server actions behind the Page composer.
//
// Failures come back as data, not as a throw. Next replaces a thrown Error
// with a generic digest across the 'use server' boundary in production, so
// throwing is a way of deleting the message you wrote (#107). The composer
// reads `.message` and shows it.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupPostCreate, groupPostEdit, groupPostDelete, ActionError } from '@/actions'
import { succeeded, failed, type ActionResult } from '@/app/you/sell/action-result'

async function currentMemberId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

function asFailure<T>(err: unknown): ActionResult<T> {
  if (err instanceof ActionError) return failed(err.message, err.code)
  return failed("That didn't go through. Mind trying again?", 'unknown')
}

export async function postToPageAction(input: {
  groupId: string
  body: string
  startsAt?: string | null
  locationId?: string | null
}): Promise<ActionResult<{ postId: string; createdAt: string }>> {
  const memberId = await currentMemberId()
  if (!memberId) return failed('Sign in first, then tell people.', 'authorization')
  try {
    const r = await groupPostCreate(resolveActionContext({ actingMemberId: memberId }), input)
    return succeeded({ postId: r.postId, createdAt: r.createdAt })
  } catch (err) {
    return asFailure(err)
  }
}

export async function editPagePostAction(input: {
  postId: string
  body: string
  startsAt?: string | null
  locationId?: string | null
}): Promise<ActionResult<{ postId: string }>> {
  const memberId = await currentMemberId()
  if (!memberId) return failed('Sign in first, then tell people.', 'authorization')
  try {
    const r = await groupPostEdit(resolveActionContext({ actingMemberId: memberId }), input)
    return succeeded({ postId: r.postId })
  } catch (err) {
    return asFailure(err)
  }
}

/** #318 — soft delete: hidden everywhere, kept for reports and audit. */
export async function deletePagePostAction(input: { postId: string }): Promise<ActionResult<{ postId: string }>> {
  const memberId = await currentMemberId()
  if (!memberId) return failed('Sign in first.', 'authorization')
  try {
    const r = await groupPostDelete(resolveActionContext({ actingMemberId: memberId }), input)
    return succeeded({ postId: r.postId })
  } catch (err) {
    return asFailure(err)
  }
}
