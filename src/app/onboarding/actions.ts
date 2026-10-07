'use server'

// T089 — Onboarding server actions (F030).
//
// Onboarding asks for the four fields F081 names (legal name, zip, display name,
// plus the email the login already has) and the 18+ box. The metro is derived
// from the zip, never picked.
//   - completeOnboardingAction → what the flow calls: member.signup_profile.set,
//                                then the login marked onboarded. No place (#205).
//   - addInterestsAction       → member.interests.add (action layer; emits).
//
// Interests go through the action layer (resolveActionContext →
// invoke) exactly like createProductAction (T078).

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberInterestsAdd, memberSignupProfileSet, ActionError } from '@/actions'
import { NotFoundError } from '@/actions/_lib/errors'
import { validateSignupProfile, type SignupProfileInput, type SignupProfileField } from '@/lib/signup/profile'
import { metroForZip } from '@/lib/signup/zip-metro'

async function requireMemberId(): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('You must be signed in.')
  return data.user.id
}

export type SaveProfileInput = SignupProfileInput

export type SaveProfileResult =
  | { ok: true; /** The metro the zip decided, shown to the person; null when the zip has none. */ metro: { name: string } | null }
  | { ok: false; field: SignupProfileField; message: string }

/**
 * The whole of onboarding (F081): the four fields and the 18+ box, the metro
 * the zip decides, and the login marked onboarded. #205 — no place is written
 * for anyone; home is that metro, or nothing.
 */
export async function completeOnboardingAction(input: SaveProfileInput): Promise<SaveProfileResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) throw new Error('You must be signed in.')

  const checked = validateSignupProfile(input)
  if (!checked.ok) return checked

  const metro = await metroForZip(supabase, checked.value.zip)
  try {
    await memberSignupProfileSet(resolveActionContext({ actingMemberId: user.id }), {
      ...checked.value,
      adultConfirmed: true,
      metroId: metro?.id ?? null,
    })
  } catch (err) {
    if (err instanceof NotFoundError) {
      // The auth-signup hook (migration 006) returns early with only a WARNING
      // when its Vault secrets are unset, so nothing ever creates the members
      // row. Fail here, where the cause is knowable, not as an FK error later.
      console.error(
        `[onboarding] no members row for auth user ${user.id}. The auth-signup hook did not create it — ` +
          'check vault.decrypted_secrets (auth_signup_hook_url / auth_signup_hook_secret) and net._http_response.',
      )
      return {
        ok: false,
        field: 'displayName',
        message: 'We could not finish setting up your account. Please contact support.',
      }
    }
    throw err
  }

  await supabase.auth.updateUser({ data: { onboarded: true } })
  return { ok: true, metro: metro ? { name: metro.name } : null }
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
