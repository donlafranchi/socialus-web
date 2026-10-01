'use server'

// T089 — Onboarding server actions (F030).
//
// Onboarding asks for one thing: a display name. Everything else is derived:
//   - saveProfileAction        → members.display_name (owner-update RLS; profile
//                                edits are not declarations, so no event).
//   - addInterestsAction       → member.interests.add (action layer; emits).
//   - completeOnboardingAction → what the flow calls: the name, then the login
//                                marked onboarded. No place (#205).
//
// Interests go through the action layer (resolveActionContext →
// invoke) exactly like createProductAction (T078).

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberInterestsAdd, ActionError } from '@/actions'

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')
  return data.user.id
}

export interface SaveProfileInput {
  displayName: string
}

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; field: 'displayName'; message: string }

export async function saveProfileAction(input: SaveProfileInput): Promise<SaveProfileResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('You must be signed in.')

  const displayName = input.displayName?.trim() ?? ''
  if (displayName.length < 1 || displayName.length > 60) {
    return { ok: false, field: 'displayName', message: 'Add a name (1–60 characters).' }
  }

  const { data: updated, error } = await supabase
    .from('members')
    .update({ display_name: displayName })
    .eq('id', user.id)
    .select('id')

  if (error) throw error

  // An UPDATE that matches no row is NOT an error in supabase-js. That happens
  // when the Member has an auth.users row but no members row — the auth-signup
  // hook (migration 006) returns early with only a WARNING when its Vault
  // secrets are unset, so nothing ever creates the row. Left silent here, the
  // failure surfaced one step later as an opaque FK violation on
  // member_place_interests.member_id. Fail here, where the cause is knowable.
  if (!updated || updated.length === 0) {
    console.error(
      `[onboarding] saveProfileAction: no members row for auth user ${user.id}. ` +
        'The auth-signup hook did not create it — check vault.decrypted_secrets ' +
        '(auth_signup_hook_url / auth_signup_hook_secret) and net._http_response.',
    )
    return {
      ok: false,
      field: 'displayName',
      message: 'We could not finish setting up your account. Please contact support.',
    }
  }

  return { ok: true }
}

/**
 * The whole of onboarding: save the display name and mark the login onboarded.
 * #205 — no place is written for anyone (F081 criterion 7). Home is the metro
 * the member's zip determines, which lands with F081's zip step.
 */
export async function completeOnboardingAction(
  input: SaveProfileInput,
): Promise<SaveProfileResult> {
  const res = await saveProfileAction(input)
  if (!res.ok) return res
  const supabase = await createClient()
  await supabase.auth.updateUser({ data: { onboarded: true } })
  return { ok: true }
}

export async function addInterestsAction(input: {
  tags: string[]
}): Promise<{ ok: true; addedTags: string[] }> {
  // Skipping interests is valid (the feed leans on locality).
  if (!input.tags || input.tags.length === 0) return { ok: true, addedTags: [] }
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    const result = await memberInterestsAdd(ctx, { tags: input.tags })
    return { ok: true, addedTags: result.addedTags }
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
}
