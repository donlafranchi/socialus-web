'use server'

// T089 — Onboarding server actions (F030).
//
// Onboarding asks for one thing: a display name. Everything else is derived:
//   - saveProfileAction        → members.display_name (owner-update RLS; profile
//                                edits are not declarations, so no event).
//   - setHomeLocalityAction    → member.place_interest.add (action layer; emits).
//   - addInterestsAction       → member.interests.add (action layer; emits).
//   - completeOnboardingAction → what the flow calls: name, then the default
//                                home locality, server-side and unseen.
//
// Locality + interests go through the action layer (resolveActionContext →
// invoke) exactly like createProductAction (T078).

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberPlaceInterestAdd, memberInterestsAdd, ActionError } from '@/actions'

// 'use server' modules may only export async functions — keep this module-local.
/** The Good Place (city) — every new Member's default primary_home at b1. */
const DEFAULT_HOME_PLACE_ID = '10000000-0000-4000-8000-000000000003'

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

export async function setHomeLocalityAction(input: {
  placeId: string
}): Promise<{ ok: true }> {
  const memberId = await requireMemberId()
  const ctx = resolveActionContext({ actingMemberId: memberId })
  try {
    await memberPlaceInterestAdd(ctx, { placeId: input.placeId, scopeKind: 'primary_home' })
  } catch (err) {
    if (err instanceof ActionError) throw new Error(err.message)
    throw err
  }
  return { ok: true }
}

/**
 * The whole of onboarding: save the display name, then default the Member's
 * primary_home to The Good Place. The locality write is invisible to the
 * Member — there is no picker.
 */
export async function completeOnboardingAction(
  input: SaveProfileInput,
): Promise<SaveProfileResult> {
  const res = await saveProfileAction(input)
  if (!res.ok) return res
  await setHomeLocalityAction({ placeId: DEFAULT_HOME_PLACE_ID })
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
