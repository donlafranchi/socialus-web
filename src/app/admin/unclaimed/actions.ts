'use server'

// #353 — Restore a hidden unclaimed Page; #987 — decide a claim with proof. Authorization is in the handlers.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { resolveActionContext } from '@/lib/action-context'
import { groupClaimDecide, groupUnclaimedRestore } from '@/actions/group'
import { ActionError } from '@/actions/_lib/errors'

export async function restoreUnclaimedAction(groupId: string, scope: 'page' | 'photo'): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  try {
    await groupUnclaimedRestore(resolveActionContext({ actingMemberId: data.user.id }), { groupId, scope })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/unclaimed')
}

export async function decideClaimAction(claimId: string, approve: boolean): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not permitted.')
  try {
    await groupClaimDecide(resolveActionContext({ actingMemberId: data.user.id }), { claimId, approve })
  } catch (err) {
    throw err instanceof ActionError ? new Error(err.message) : err
  }
  revalidatePath('/admin/unclaimed')
}
