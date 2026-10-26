'use server'

// #892 — add or remove one of the member's own interests from You. Failures come back as data, never a throw.

import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { memberInterestsAdd, memberInterestsRemove } from '@/actions'
import { isVocabTag } from '@/lib/onboarding/interest-vocab'

export async function setInterestAction(tag: string, on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isVocabTag(tag)) return { ok: false, message: 'That didn’t save. Try again.' }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { ok: false, message: 'Sign in first.' }
  try {
    const ctx = resolveActionContext({ actingMemberId: data.user.id })
    if (on) await memberInterestsAdd(ctx, { tags: [tag] })
    else await memberInterestsRemove(ctx, { tags: [tag] })
    return { ok: true }
  } catch {
    return { ok: false, message: 'That didn’t save. Try again.' }
  }
}
