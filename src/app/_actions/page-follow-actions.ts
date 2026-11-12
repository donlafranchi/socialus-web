'use server'

// F067 — server actions behind the Page follow control.
//
// Same shape as group-membership-actions.ts: createClient → getUser →
// resolveActionContext → handler → catch ActionError.
//
// The handler decides follow-vs-join from the Page's privacy, not the caller,
// so a client cannot ask to be a member of an open Page.

import { createClient } from '@/lib/supabase-server'
import { viewerId } from '@/lib/auth/viewer'
import { resolveActionContext } from '@/lib/action-context'
import { groupFollow, groupUnfollow, ActionError, type Relationship } from '@/actions'

async function requireMemberId(): Promise<string> {
  // #1269 — from the verified token, as #791 does for reads: no auth-server round trip per tap.
  const memberId = await viewerId(await createClient())
  if (!memberId) throw new Error('You must be signed in.')
  return memberId
}

export async function followPageAction(input: {
  groupId: string
}): Promise<{ ok: true; relationship: Relationship }> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    const { relationship } = await groupFollow(ctx, { groupId: input.groupId })
    return { ok: true, relationship }
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}

export async function unfollowPageAction(input: { groupId: string }): Promise<{ ok: true }> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await groupUnfollow(ctx, { groupId: input.groupId })
    return { ok: true }
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}
